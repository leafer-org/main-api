import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loginAsAdmin, registerUser } from '../../actors/auth.js';
import { startContainers, stopContainers } from '../../helpers/containers.js';
import { type E2eApp } from '../../helpers/create-app.js';
import { runMigrations, seedAdminUser, seedStaticRoles, truncateAll } from '../../helpers/db.js';
import { createBuckets } from '../../helpers/s3.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';

const FIXED_OTP = '123456';

describe('Board Members', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    await startContainers();
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await runMigrations(process.env.DB_URL);
    await createBuckets();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OtpGeneratorService)
      .useValue({ generate: () => OtpCode.raw(FIXED_OTP) })
      .compile();

    const app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    e2e = {
      app,
      agent: request(app.getHttpServer()),
    };
  });

  beforeEach(async () => {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await seedStaticRoles(process.env.DB_URL);
    await seedAdminUser(process.env.DB_URL);
  });

  afterEach(async () => {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await truncateAll(process.env.DB_URL);
  });

  afterAll(async () => {
    await e2e?.app.close();
    await stopContainers();
  });

  // ─── helpers ────────────────────────────────────────────────────────

  async function createBoard(token: string, name = 'Test Board') {
    const res = await e2e.agent
      .post('/admin/boards')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, description: null, scope: 'platform', organizationId: null, manualCreation: false })
      .expect(201);
    return res.body;
  }

  // ─── Board Members ─────────────────────────────────────────────────

  it('POST /admin/boards/:boardId/members добавляет участника по телефону', async () => {
    const { userId } = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000099' });
    const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
    const board = await createBoard(accessToken);

    const res = await e2e.agent
      .post(`/admin/boards/${board.boardId}/members`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ phone: '+79990000099' })
      .expect(201);

    expect(res.body.boardId).toBe(board.boardId);
    expect(res.body.memberIds).toContain(userId);
  });

  it('Пользователь не найден по телефону — 404', async () => {
    const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
    const board = await createBoard(accessToken);

    const res = await e2e.agent
      .post(`/admin/boards/${board.boardId}/members`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ phone: '+79990000000' })
      .expect(404);

    expect(res.body.type).toBe('user_not_found_by_phone');
  });

  it('Участник уже добавлен — 409', async () => {
    await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000099' });
    const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
    const board = await createBoard(accessToken);

    await e2e.agent
      .post(`/admin/boards/${board.boardId}/members`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ phone: '+79990000099' })
      .expect(201);

    const res = await e2e.agent
      .post(`/admin/boards/${board.boardId}/members`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ phone: '+79990000099' })
      .expect(409);

    expect(res.body.type).toBe('member_already_exists');
  });

  it('DELETE /admin/boards/:boardId/members/:userId удаляет участника, 204', async () => {
    const { userId } = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000099' });
    const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
    const board = await createBoard(accessToken);

    await e2e.agent
      .post(`/admin/boards/${board.boardId}/members`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ phone: '+79990000099' })
      .expect(201);

    await e2e.agent
      .delete(`/admin/boards/${board.boardId}/members/${userId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    const detail = await e2e.agent
      .get(`/admin/boards/${board.boardId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(detail.body.memberIds).not.toContain(userId);
  });

  it('Участник не найден при удалении — 404', async () => {
    const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
    const board = await createBoard(accessToken);

    const res = await e2e.agent
      .delete(`/admin/boards/${board.boardId}/members/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(res.body.type).toBe('member_not_found');
  });
});

import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loginAsAdmin } from '../../actors/auth.js';
import { startContainers, stopContainers } from '../../helpers/containers.js';
import { type E2eApp } from '../../helpers/create-app.js';
import { runMigrations, seedAdminUser, seedStaticRoles, truncateAll } from '../../helpers/db.js';
import { createBuckets } from '../../helpers/s3.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';

const FIXED_OTP = '123456';

describe('Board Automations', () => {
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

  // ─── CRUD автоматизаций ────────────────────────────────────────────

  describe('CRUD автоматизаций', () => {
  it('PUT /admin/boards/:boardId/automation добавляет автоматизацию', async () => {
    const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
    const board = await createBoard(accessToken, 'Main Board');
    const fallbackBoard = await createBoard(accessToken, 'Fallback Board');

    const res = await e2e.agent
      .put(`/admin/boards/${board.boardId}/automation`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        agentId: 'agent-1',
        systemPrompt: 'You are a support agent',
        onUncertainMoveToBoardId: fallbackBoard.boardId,
      })
      .expect((r: request.Response) => {
        expect([200, 201]).toContain(r.status);
      });

    expect(res.body.boardId).toBe(board.boardId);
    expect(res.body.automations).toHaveLength(1);
    expect(res.body.automations[0].id).toBeDefined();
    expect(res.body.automations[0].agentId).toBe('agent-1');
    expect(res.body.automations[0].systemPrompt).toBe('You are a support agent');
    expect(res.body.automations[0].onUncertain.moveToBoardId).toBe(fallbackBoard.boardId);
  });

  it('PUT с onUncertainMoveToBoardId=null — автоматизация без fallback-доски', async () => {
    const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
    const board = await createBoard(accessToken);

    const res = await e2e.agent
      .put(`/admin/boards/${board.boardId}/automation`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        agentId: 'agent-2',
        systemPrompt: 'Classify tickets',
        onUncertainMoveToBoardId: null,
      })
      .expect((r: request.Response) => {
        expect([200, 201]).toContain(r.status);
      });

    expect(res.body.automations).toHaveLength(1);
    expect(res.body.automations[0].agentId).toBe('agent-2');
    expect(res.body.automations[0].systemPrompt).toBe('Classify tickets');
    expect(res.body.automations[0].onUncertain.moveToBoardId).toBeNull();
  });

  it('DELETE /admin/boards/:boardId/automation/:automationId удаляет автоматизацию, возвращает 204', async () => {
    const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
    const board = await createBoard(accessToken);

    const addRes = await e2e.agent
      .put(`/admin/boards/${board.boardId}/automation`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        agentId: 'agent-3',
        systemPrompt: 'Handle inquiries',
        onUncertainMoveToBoardId: null,
      });

    const automationId = addRes.body.automations[0].id;

    await e2e.agent
      .delete(`/admin/boards/${board.boardId}/automation/${automationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    // Verify automation was removed via GET board detail
    const detailRes = await e2e.agent
      .get(`/admin/boards/${board.boardId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(detailRes.body.automations).toHaveLength(0);
  });

  it('Автоматизация не найдена при удалении — 404', async () => {
    const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
    const board = await createBoard(accessToken);

    const res = await e2e.agent
      .delete(`/admin/boards/${board.boardId}/automation/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(res.body.type).toBe('automation_not_found');
  });
  });
});

import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loginAsAdmin, registerUser } from '../../../actors/auth.js';
import { startContainers, stopContainers } from '../../../helpers/containers.js';
import { type E2eApp } from '../../../helpers/create-app.js';
import { ADMIN_PHONE, runMigrations, seedAdminUser, seedStaticRoles, truncateAll } from '../../../helpers/db.js';
import { createBuckets } from '../../../helpers/s3.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';

const FIXED_OTP = '123456';

describe('Ticket My Boards (e2e)', () => {
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

  async function createBoardWithMember(adminToken: string, memberPhone: string) {
    const boardRes = await e2e.agent
      .post('/admin/boards')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Test Board',
        description: null,
        scope: 'platform',
        organizationId: null,
        manualCreation: true,
      })
      .expect(201);

    const boardId = boardRes.body.boardId;

    await e2e.agent
      .post(`/admin/boards/${boardId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phone: memberPhone })
      .expect(201);

    return boardId;
  }

  const ADMIN_PHONE_FORMATTED = `+${ADMIN_PHONE}`;

  // ─── GET /admin/boards/my ───────────────────────────────────────────

  describe('GET /admin/boards/my', () => {
    it('возвращает доски где текущий пользователь является участником', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      // Create 2 boards
      const board1Res = await e2e.agent
        .post('/admin/boards')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Board With Member',
          description: null,
          scope: 'platform',
          organizationId: null,
          manualCreation: true,
        })
        .expect(201);

      await e2e.agent
        .post('/admin/boards')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Board Without Member',
          description: null,
          scope: 'platform',
          organizationId: null,
          manualCreation: true,
        })
        .expect(201);

      // Add admin as member to only board1
      await e2e.agent
        .post(`/admin/boards/${board1Res.body.boardId}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ phone: ADMIN_PHONE_FORMATTED })
        .expect(201);

      const res = await e2e.agent
        .get('/admin/boards/my')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBe(1);
    });

    it('Доска появляется после добавления участника', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      const boardRes = await e2e.agent
        .post('/admin/boards')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Board',
          description: null,
          scope: 'platform',
          organizationId: null,
          manualCreation: true,
        })
        .expect(201);

      // Before adding member — empty
      const resBefore = await e2e.agent
        .get('/admin/boards/my')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(resBefore.body).toBeInstanceOf(Array);
      expect(resBefore.body.length).toBe(0);

      // Add admin as member
      await e2e.agent
        .post(`/admin/boards/${boardRes.body.boardId}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ phone: ADMIN_PHONE_FORMATTED })
        .expect(201);

      // After adding member — 1 board
      const resAfter = await e2e.agent
        .get('/admin/boards/my')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(resAfter.body).toBeInstanceOf(Array);
      expect(resAfter.body.length).toBe(1);
    });

    it('Доска исчезает после удаления участника', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      const boardRes = await e2e.agent
        .post('/admin/boards')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Board',
          description: null,
          scope: 'platform',
          organizationId: null,
          manualCreation: true,
        })
        .expect(201);
      const boardId = boardRes.body.boardId;

      // Add admin as member
      await e2e.agent
        .post(`/admin/boards/${boardId}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ phone: ADMIN_PHONE_FORMATTED })
        .expect(201);

      // Verify 1 board
      const resWith = await e2e.agent
        .get('/admin/boards/my')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(resWith.body.length).toBe(1);

      // Remove member
      await e2e.agent
        .delete(`/admin/boards/${boardId}/members/${adminUserId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // Verify empty
      const resWithout = await e2e.agent
        .get('/admin/boards/my')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(resWithout.body.length).toBe(0);
    });
  });
});

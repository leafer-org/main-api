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

describe('Ticket Unassign All (e2e)', () => {
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

  async function createTicket(token: string, boardId: string, overrides?: { message?: string }) {
    const res = await e2e.agent
      .post('/admin/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        boardId,
        message: overrides?.message ?? 'Test ticket',
        data: {},
      })
      .expect(201);

    return res.body;
  }

  async function assignTicket(token: string, ticketId: string, assigneeId: string) {
    const res = await e2e.agent
      .post(`/admin/tickets/${ticketId}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ assigneeId })
      .expect(200);

    return res.body;
  }

  // ─── POST /admin/tickets/unassign-all ──────────────────────────────

  describe('POST /admin/tickets/unassign-all', () => {
    it('снимает назначение со всех тикетов текущего пользователя', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      const boardId = await createBoardWithMember(accessToken, ADMIN_PHONE_FORMATTED);

      const ticket1 = await createTicket(accessToken, boardId, { message: 'Ticket 1' });
      const ticket2 = await createTicket(accessToken, boardId, { message: 'Ticket 2' });

      await assignTicket(accessToken, ticket1.ticketId, adminUserId);
      await assignTicket(accessToken, ticket2.ticketId, adminUserId);

      await e2e.agent
        .post('/admin/tickets/unassign-all')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // Verify both tickets are back to open
      const detail1 = await e2e.agent
        .get(`/admin/tickets/${ticket1.ticketId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const detail2 = await e2e.agent
        .get(`/admin/tickets/${ticket2.ticketId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(detail1.body.status).toBe('open');
      expect(detail1.body.assigneeId).toBeNull();
      expect(detail2.body.status).toBe('open');
      expect(detail2.body.assigneeId).toBeNull();
    });

    it('Нет назначенных тикетов — 204 без ошибки', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      await e2e.agent
        .post('/admin/tickets/unassign-all')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });

    it('Затрагивает только тикеты текущего пользователя', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      // Register second user and give ADMIN role
      const { userId: secondUserId, accessToken: secondToken } = await registerUser(
        e2e.agent,
        FIXED_OTP,
        { phone: '+79990000040' },
      );

      const rolesRes = await e2e.agent
        .get('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminRole = rolesRes.body.roles.find((r: { name: string }) => r.name === 'ADMIN');
      await e2e.agent
        .patch(`/users/${secondUserId}/role`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ roleId: adminRole.id })
        .expect(200);

      const boardId = await createBoardWithMember(accessToken, ADMIN_PHONE_FORMATTED);

      // Add second user as member
      await e2e.agent
        .post(`/admin/boards/${boardId}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ phone: '+79990000040' })
        .expect(201);

      const ticket1 = await createTicket(accessToken, boardId, { message: 'Admin ticket' });
      const ticket2 = await createTicket(accessToken, boardId, { message: 'Second user ticket' });

      // Assign ticket1 to admin, ticket2 to second user
      await assignTicket(accessToken, ticket1.ticketId, adminUserId);
      await assignTicket(accessToken, ticket2.ticketId, secondUserId);

      // Unassign-all as admin
      await e2e.agent
        .post('/admin/tickets/unassign-all')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // ticket1 should be open, ticket2 should still be in-progress
      const detail1 = await e2e.agent
        .get(`/admin/tickets/${ticket1.ticketId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const detail2 = await e2e.agent
        .get(`/admin/tickets/${ticket2.ticketId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(detail1.body.status).toBe('open');
      expect(detail1.body.assigneeId).toBeNull();
      expect(detail2.body.status).toBe('in-progress');
      expect(detail2.body.assigneeId).toBe(secondUserId);
    });
  });
});

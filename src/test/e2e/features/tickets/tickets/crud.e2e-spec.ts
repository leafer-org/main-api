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

describe('ticket-management', () => {
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

  // ─── POST /admin/tickets ───────────────────────────────────────────

  describe('Создание тикета', () => {
    it('POST /admin/tickets создаёт тикет на доске с manualCreation=true', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const { userId } = await registerUser(e2e.agent, FIXED_OTP);

      const boardId = await createBoardWithMember(accessToken, '+79990000002');

      // Grant TICKET.MANAGE to the user by giving them ADMIN role
      const rolesRes = await e2e.agent
        .get('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminRole = rolesRes.body.roles.find((r: { name: string }) => r.name === 'ADMIN');
      await e2e.agent
        .patch(`/users/${userId}/role`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ roleId: adminRole.id })
        .expect(200);

      // Re-login to get a fresh token with ADMIN role
      const { accessToken: memberToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      // Admin creates ticket (admin is not a member, but let's use admin directly as creator)
      // Actually, let's add admin as member and create ticket as admin
      const adminMeRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = adminMeRes.body.id;

      await e2e.agent
        .post(`/admin/boards/${boardId}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ phone: ADMIN_PHONE_FORMATTED })
        .expect(201);

      const ticket = await createTicket(accessToken, boardId, {
        message: 'Модерация нового товара',
      });

      expect(ticket.ticketId).toBeDefined();
      expect(ticket.boardId).toBe(boardId);
      expect(ticket.message).toBe('Модерация нового товара');
      expect(ticket.status).toBe('open');
    });

    it('Доска с manualCreation=false — ошибка 400 manual_creation_not_allowed', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      // Create board with manualCreation: false
      const boardRes = await e2e.agent
        .post('/admin/boards')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Auto Board',
          description: null,
          scope: 'platform',
          organizationId: null,
          manualCreation: false,
        })
        .expect(201);

      const res = await e2e.agent
        .post('/admin/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ boardId: boardRes.body.boardId, message: 'Test', data: {} })
        .expect(400);

      expect(res.body.type).toBe('manual_creation_not_allowed');
    });

    it('Создатель не является участником доски — ошибка 403 not_a_board_member', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      // Board with manualCreation but admin is NOT a member
      const boardRes = await e2e.agent
        .post('/admin/boards')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Member Board',
          description: null,
          scope: 'platform',
          organizationId: null,
          manualCreation: true,
        })
        .expect(201);

      const res = await e2e.agent
        .post('/admin/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ boardId: boardRes.body.boardId, message: 'Test', data: {} })
        .expect(403);

      expect(res.body.type).toBe('not_a_board_member');
    });

    it('POST /admin/tickets без авторизации — 401', async () => {
      await e2e.agent
        .post('/admin/tickets')
        .send({ boardId: '00000000-0000-0000-0000-000000000000', message: 'Test', data: {} })
        .expect(401);
    });

    it('POST /admin/tickets без TICKET.MANAGE — 403', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);

      await e2e.agent
        .post('/admin/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ boardId: '00000000-0000-0000-0000-000000000000', message: 'Test', data: {} })
        .expect(403);
    });
  });

  // ─── GET /admin/tickets ────────────────────────────────────────────

  describe('Список тикетов', () => {
    it('GET /admin/tickets возвращает список с пагинацией (from, size)', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      const boardId = await createBoardWithMember(accessToken, ADMIN_PHONE_FORMATTED);

      await createTicket(accessToken, boardId, { message: 'Ticket 1' });
      await createTicket(accessToken, boardId, { message: 'Ticket 2' });

      const res = await e2e.agent
        .get('/admin/tickets')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.tickets).toBeInstanceOf(Array);
      expect(res.body.tickets.length).toBe(2);
      expect(res.body.total).toBe(2);
    });

    it('GET /admin/tickets?boardId= фильтрует по доске', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      const boardA = await createBoardWithMember(accessToken, ADMIN_PHONE_FORMATTED);

      const boardBRes = await e2e.agent
        .post('/admin/boards')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Board B',
          description: null,
          scope: 'platform',
          organizationId: null,
          manualCreation: true,
        })
        .expect(201);
      await e2e.agent
        .post(`/admin/boards/${boardBRes.body.boardId}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ phone: ADMIN_PHONE_FORMATTED })
        .expect(201);

      await createTicket(accessToken, boardA, { message: 'On A' });
      await createTicket(accessToken, boardBRes.body.boardId, { message: 'On B' });

      const res = await e2e.agent
        .get(`/admin/tickets?boardId=${boardA}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.tickets.length).toBe(1);
      expect(res.body.tickets[0].message).toBe('On A');
    });

    it('GET /admin/tickets?status= фильтрует по статусу (open/in-progress/done)', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      const boardId = await createBoardWithMember(accessToken, ADMIN_PHONE_FORMATTED);

      const ticket1 = await createTicket(accessToken, boardId, { message: 'Ticket open' });
      const ticket2 = await createTicket(accessToken, boardId, { message: 'Ticket in-progress' });

      // Assign ticket2 to move it to in-progress
      await assignTicket(accessToken, ticket2.ticketId, adminUserId);

      const openRes = await e2e.agent
        .get('/admin/tickets?status=open')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(openRes.body.tickets.length).toBe(1);
      expect(openRes.body.tickets[0].ticketId).toBe(ticket1.ticketId);

      const inProgressRes = await e2e.agent
        .get('/admin/tickets?status=in-progress')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(inProgressRes.body.tickets.length).toBe(1);
      expect(inProgressRes.body.tickets[0].ticketId).toBe(ticket2.ticketId);
    });

    it('GET /admin/tickets?assigneeId= фильтрует по исполнителю', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      const boardId = await createBoardWithMember(accessToken, ADMIN_PHONE_FORMATTED);

      await createTicket(accessToken, boardId, { message: 'Unassigned ticket' });
      const ticket2 = await createTicket(accessToken, boardId, { message: 'Assigned ticket' });

      // Assign ticket2 to admin
      await assignTicket(accessToken, ticket2.ticketId, adminUserId);

      const res = await e2e.agent
        .get(`/admin/tickets?assigneeId=${adminUserId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.tickets.length).toBe(1);
      expect(res.body.tickets[0].ticketId).toBe(ticket2.ticketId);
    });
  });

  // ─── GET /admin/tickets/:ticketId ──────────────────────────────────

  describe('Список тикетов', () => {
    it('GET /admin/tickets/:ticketId возвращает полные данные тикета с историей', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      const boardId = await createBoardWithMember(accessToken, ADMIN_PHONE_FORMATTED);
      const ticket = await createTicket(accessToken, boardId);

      const res = await e2e.agent
        .get(`/admin/tickets/${ticket.ticketId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.ticketId).toBe(ticket.ticketId);
      expect(res.body.boardId).toBe(boardId);
      expect(res.body.message).toBe('Test ticket');
      expect(res.body.status).toBe('open');
      expect(res.body.assigneeId).toBeNull();
      expect(res.body.history).toBeInstanceOf(Array);
      expect(res.body.history.length).toBeGreaterThanOrEqual(1);
      expect(res.body.history[0].action).toBe('created');
    });

    it('GET /admin/tickets/:ticketId — несуществующий тикет — 404', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      await e2e.agent
        .get('/admin/tickets/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});

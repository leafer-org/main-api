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

  // ─── POST /admin/tickets/:ticketId/assign ──────────────────────────

  describe('Назначение исполнителя', () => {
    it('POST /admin/tickets/:ticketId/assign назначает участника доски, переводит в in-progress', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      const boardId = await createBoardWithMember(accessToken, ADMIN_PHONE_FORMATTED);
      const ticket = await createTicket(accessToken, boardId);

      const res = await assignTicket(accessToken, ticket.ticketId, adminUserId);

      expect(res.status).toBe('in-progress');
      expect(res.assigneeId).toBe(adminUserId);
    });

    it('Назначение на не-участника доски — ошибка 403 not_a_board_member', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      const boardId = await createBoardWithMember(accessToken, ADMIN_PHONE_FORMATTED);
      const ticket = await createTicket(accessToken, boardId);

      const { userId: nonMemberId } = await registerUser(e2e.agent, FIXED_OTP, {
        phone: '+79990000020',
      });

      const res = await e2e.agent
        .post(`/admin/tickets/${ticket.ticketId}/assign`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ assigneeId: nonMemberId })
        .expect(403);

      expect(res.body.type).toBe('not_a_board_member');
    });
  });

  // ─── POST /admin/tickets/:ticketId/unassign ────────────────────────

  describe('Назначение исполнителя', () => {
    it('POST /admin/tickets/:ticketId/unassign снимает назначение, возвращает в open', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      const boardId = await createBoardWithMember(accessToken, ADMIN_PHONE_FORMATTED);
      const ticket = await createTicket(accessToken, boardId);

      await assignTicket(accessToken, ticket.ticketId, adminUserId);

      await e2e.agent
        .post(`/admin/tickets/${ticket.ticketId}/unassign`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // Verify status is back to open
      const detail = await e2e.agent
        .get(`/admin/tickets/${ticket.ticketId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(detail.body.status).toBe('open');
      expect(detail.body.assigneeId).toBeNull();
    });

    it('Снятие назначения с тикета не в in-progress — ошибка 400 ticket_not_in_progress', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      const boardId = await createBoardWithMember(accessToken, ADMIN_PHONE_FORMATTED);
      const ticket = await createTicket(accessToken, boardId);

      const res = await e2e.agent
        .post(`/admin/tickets/${ticket.ticketId}/unassign`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(res.body.type).toBe('ticket_not_in_progress');
    });
  });

  // ─── POST /admin/tickets/:ticketId/done ────────────────────────────

  describe('Закрытие и переоткрытие', () => {
    it('POST /admin/tickets/:ticketId/done переводит in-progress тикет в done', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      const boardId = await createBoardWithMember(accessToken, ADMIN_PHONE_FORMATTED);
      const ticket = await createTicket(accessToken, boardId);

      await assignTicket(accessToken, ticket.ticketId, adminUserId);

      await e2e.agent
        .post(`/admin/tickets/${ticket.ticketId}/done`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      const detail = await e2e.agent
        .get(`/admin/tickets/${ticket.ticketId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(detail.body.status).toBe('done');
    });

    it('Закрытие тикета не в in-progress — ошибка 400 ticket_not_in_progress', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      const boardId = await createBoardWithMember(accessToken, ADMIN_PHONE_FORMATTED);
      const ticket = await createTicket(accessToken, boardId);

      const res = await e2e.agent
        .post(`/admin/tickets/${ticket.ticketId}/done`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(res.body.type).toBe('ticket_not_in_progress');
    });
  });

  // ─── POST /admin/tickets/:ticketId/reopen ──────────────────────────

  describe('Закрытие и переоткрытие', () => {
    it('POST /admin/tickets/:ticketId/reopen переводит done тикет обратно в open', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      const boardId = await createBoardWithMember(accessToken, ADMIN_PHONE_FORMATTED);
      const ticket = await createTicket(accessToken, boardId);

      await assignTicket(accessToken, ticket.ticketId, adminUserId);

      await e2e.agent
        .post(`/admin/tickets/${ticket.ticketId}/done`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      await e2e.agent
        .post(`/admin/tickets/${ticket.ticketId}/reopen`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      const detail = await e2e.agent
        .get(`/admin/tickets/${ticket.ticketId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(detail.body.status).toBe('open');
      expect(detail.body.assigneeId).toBeNull();
    });

    it('Переоткрытие тикета не в done — ошибка 400 ticket_not_done', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      const boardId = await createBoardWithMember(accessToken, ADMIN_PHONE_FORMATTED);
      const ticket = await createTicket(accessToken, boardId);

      const res = await e2e.agent
        .post(`/admin/tickets/${ticket.ticketId}/reopen`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(res.body.type).toBe('ticket_not_done');
    });
  });

  // ─── POST /admin/tickets/:ticketId/move ────────────────────────────

  describe('Перемещение между досками', () => {
    it('POST /admin/tickets/:ticketId/move перемещает тикет на разрешённую доску', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      // Create target board
      const targetRes = await e2e.agent
        .post('/admin/boards')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Target Board',
          description: null,
          scope: 'platform',
          organizationId: null,
          manualCreation: false,
        })
        .expect(201);
      const targetBoardId = targetRes.body.boardId;

      // Create source board with allowedTransferBoardIds
      const sourceRes = await e2e.agent
        .post('/admin/boards')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Source Board',
          description: null,
          scope: 'platform',
          organizationId: null,
          manualCreation: true,
        })
        .expect(201);
      const sourceBoardId = sourceRes.body.boardId;

      // Update source board to allow transfer to target
      await e2e.agent
        .patch(`/admin/boards/${sourceBoardId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Source Board',
          description: null,
          manualCreation: true,
          allowedTransferBoardIds: [targetBoardId],
        })
        .expect(200);

      // Add admin as member
      await e2e.agent
        .post(`/admin/boards/${sourceBoardId}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ phone: ADMIN_PHONE_FORMATTED })
        .expect(201);

      const ticket = await createTicket(accessToken, sourceBoardId);

      const res = await e2e.agent
        .post(`/admin/tickets/${ticket.ticketId}/move`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ toBoardId: targetBoardId, comment: 'Escalating to manual review' })
        .expect(200);

      expect(res.body.boardId).toBe(targetBoardId);
    });

    it('Перемещение на доску не из allowedTransferBoardIds — ошибка 400 ticket_transfer_not_allowed', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      const boardId = await createBoardWithMember(accessToken, ADMIN_PHONE_FORMATTED);
      const ticket = await createTicket(accessToken, boardId);

      const res = await e2e.agent
        .post(`/admin/tickets/${ticket.ticketId}/move`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ toBoardId: '00000000-0000-0000-0000-000000000099', comment: 'Trying' })
        .expect(400);

      expect(res.body.type).toBe('ticket_transfer_not_allowed');
    });
  });

  // ─── POST /admin/tickets/:ticketId/comments ────────────────────────

  describe('Комментарии', () => {
    it('POST /admin/tickets/:ticketId/comments добавляет комментарий в историю', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      const boardId = await createBoardWithMember(accessToken, ADMIN_PHONE_FORMATTED);
      const ticket = await createTicket(accessToken, boardId);

      await e2e.agent
        .post(`/admin/tickets/${ticket.ticketId}/comments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ text: 'This needs attention' })
        .expect(200);

      // Verify in detail
      const detail = await e2e.agent
        .get(`/admin/tickets/${ticket.ticketId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const commentEntry = detail.body.history.find(
        (h: { action: string }) => h.action === 'commented',
      );
      expect(commentEntry).toBeDefined();
    });
  });

  // ─── POST /admin/tickets/:ticketId/reassign ────────────────────────

  describe('Назначение исполнителя', () => {
    it('POST /admin/tickets/:ticketId/reassign переназначает исполнителя у in-progress тикета', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      const { userId: otherUserId } = await registerUser(e2e.agent, FIXED_OTP, {
        phone: '+79990000030',
      });

      const boardId = await createBoardWithMember(accessToken, ADMIN_PHONE_FORMATTED);

      // Add second member
      await e2e.agent
        .post(`/admin/boards/${boardId}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ phone: '+79990000030' })
        .expect(201);

      const ticket = await createTicket(accessToken, boardId);
      await assignTicket(accessToken, ticket.ticketId, adminUserId);

      const res = await e2e.agent
        .post(`/admin/tickets/${ticket.ticketId}/reassign`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ assigneeId: otherUserId })
        .expect(200);

      expect(res.body.assigneeId).toBe(otherUserId);
      expect(res.body.status).toBe('in-progress');
    });

    it('Переназначение тикета не в in-progress — ошибка 400 ticket_not_in_progress', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      const boardId = await createBoardWithMember(accessToken, ADMIN_PHONE_FORMATTED);
      const ticket = await createTicket(accessToken, boardId);

      const res = await e2e.agent
        .post(`/admin/tickets/${ticket.ticketId}/reassign`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ assigneeId: adminUserId })
        .expect(400);

      expect(res.body.type).toBe('ticket_not_in_progress');
    });
  });

  // ─── GET /admin/tickets/my ─────────────────────────────────────────

  describe('Список тикетов', () => {
    it('GET /admin/tickets/my возвращает тикеты в статусе in-progress назначенные текущему пользователю', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      const boardId = await createBoardWithMember(accessToken, ADMIN_PHONE_FORMATTED);

      const ticket1 = await createTicket(accessToken, boardId, { message: 'Assigned ticket' });
      await createTicket(accessToken, boardId, { message: 'Unassigned ticket' });

      await assignTicket(accessToken, ticket1.ticketId, adminUserId);

      const res = await e2e.agent
        .get('/admin/tickets/my')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.tickets.length).toBe(1);
      expect(res.body.tickets[0].message).toBe('Assigned ticket');
    });
  });

  // ─── Full workflow ─────────────────────────────────────────────────

  describe('Полный жизненный цикл', () => {
    it('created → assigned → commented → done → reopened → assigned → done', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const meRes = await e2e.agent
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const adminUserId = meRes.body.id;

      const boardId = await createBoardWithMember(accessToken, ADMIN_PHONE_FORMATTED);

      // Create
      const ticket = await createTicket(accessToken, boardId);
      expect(ticket.status).toBe('open');

      // Assign
      await assignTicket(accessToken, ticket.ticketId, adminUserId);

      // Comment
      await e2e.agent
        .post(`/admin/tickets/${ticket.ticketId}/comments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ text: 'Working on it' })
        .expect(200);

      // Done
      await e2e.agent
        .post(`/admin/tickets/${ticket.ticketId}/done`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // Reopen
      await e2e.agent
        .post(`/admin/tickets/${ticket.ticketId}/reopen`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // Assign again
      await assignTicket(accessToken, ticket.ticketId, adminUserId);

      // Done again
      await e2e.agent
        .post(`/admin/tickets/${ticket.ticketId}/done`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // Verify full history
      const detail = await e2e.agent
        .get(`/admin/tickets/${ticket.ticketId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(detail.body.status).toBe('done');

      const actions = detail.body.history.map((h: { action: string }) => h.action);
      expect(actions).toEqual([
        'created',
        'assigned',
        'commented',
        'done',
        'reopened',
        'assigned',
        'done',
      ]);
    });
  });
});

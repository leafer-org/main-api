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

describe('Boards (e2e)', () => {
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

  async function createBoard(
    token: string,
    overrides?: Partial<{
      name: string;
      description: string | null;
      scope: string;
      organizationId: string | null;
      manualCreation: boolean;
    }>,
  ) {
    const res = await e2e.agent
      .post('/admin/boards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: overrides?.name ?? 'Test Board',
        description: overrides?.description ?? null,
        scope: overrides?.scope ?? 'platform',
        organizationId: overrides?.organizationId ?? null,
        manualCreation: overrides?.manualCreation ?? false,
      })
      .expect(201);

    return res.body;
  }

  // ─── POST /admin/boards ────────────────────────────────────────────

  describe('POST /admin/boards', () => {
    it('should create a platform board', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const board = await createBoard(accessToken, {
        name: 'Модерация товаров',
        description: 'Доска для модерации',
        scope: 'platform',
        manualCreation: true,
      });

      expect(board.boardId).toBeDefined();
      expect(board.name).toBe('Модерация товаров');
      expect(board.description).toBe('Доска для модерации');
      expect(board.scope).toBe('platform');
      expect(board.manualCreation).toBe(true);
      expect(board.subscriptions).toEqual([]);
      expect(board.memberIds).toEqual([]);
      expect(board.automations).toEqual([]);
    });

    it('should return 401 without auth', async () => {
      await e2e.agent
        .post('/admin/boards')
        .send({ name: 'Board', description: null, scope: 'platform', organizationId: null, manualCreation: false })
        .expect(401);
    });

    it('should return 403 for user without TICKET_BOARD.MANAGE', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);

      await e2e.agent
        .post('/admin/boards')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Board', description: null, scope: 'platform', organizationId: null, manualCreation: false })
        .expect(403);
    });
  });

  // ─── GET /admin/boards ─────────────────────────────────────────────

  describe('GET /admin/boards', () => {
    it('should return list of boards', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      await createBoard(accessToken, { name: 'Board A' });
      await createBoard(accessToken, { name: 'Board B' });

      const res = await e2e.agent
        .get('/admin/boards')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBe(2);

      const names = res.body.map((b: { name: string }) => b.name);
      expect(names).toContain('Board A');
      expect(names).toContain('Board B');
    });

    it('should filter boards by scope', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      await createBoard(accessToken, { name: 'Platform Board', scope: 'platform' });
      await createBoard(accessToken, { name: 'Org Board', scope: 'organization' });

      const res = await e2e.agent
        .get('/admin/boards?scope=platform')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.length).toBe(1);
      expect(res.body[0].name).toBe('Platform Board');
    });
  });

  // ─── PATCH /admin/boards/:boardId ──────────────────────────────────

  describe('PATCH /admin/boards/:boardId', () => {
    it('should update board name and settings', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const board = await createBoard(accessToken);

      const res = await e2e.agent
        .patch(`/admin/boards/${board.boardId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Updated Board',
          description: 'New description',
          manualCreation: true,
          allowedTransferBoardIds: [],
        })
        .expect(200);

      expect(res.body.name).toBe('Updated Board');
      expect(res.body.description).toBe('New description');
      expect(res.body.manualCreation).toBe(true);
    });

    it('should return 404 for non-existent board', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      await e2e.agent
        .patch('/admin/boards/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'X', description: null, manualCreation: false, allowedTransferBoardIds: [] })
        .expect(404);
    });
  });

  // ─── DELETE /admin/boards/:boardId ─────────────────────────────────

  describe('DELETE /admin/boards/:boardId', () => {
    it('should delete a board', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const board = await createBoard(accessToken);

      await e2e.agent
        .delete(`/admin/boards/${board.boardId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // Verify it's gone from listing
      const res = await e2e.agent
        .get('/admin/boards')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.length).toBe(0);
    });

    it('should return 404 for non-existent board', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      await e2e.agent
        .delete('/admin/boards/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  // ─── POST /admin/boards/:boardId/subscriptions ─────────────────────

  describe('POST /admin/boards/:boardId/subscriptions', () => {
    it('should add a subscription to a board', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const board = await createBoard(accessToken);

      const res = await e2e.agent
        .post(`/admin/boards/${board.boardId}/subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ triggerId: 'item.moderation-requested', filters: [] })
        .expect(201);

      expect(res.body.subscriptions).toHaveLength(1);
      expect(res.body.subscriptions[0].triggerId).toBe('item.moderation-requested');
    });

    it('should add multiple subscriptions', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const board = await createBoard(accessToken);

      await e2e.agent
        .post(`/admin/boards/${board.boardId}/subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ triggerId: 'item.moderation-requested', filters: [] })
        .expect(201);

      const res = await e2e.agent
        .post(`/admin/boards/${board.boardId}/subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ triggerId: 'organization.moderation-requested', filters: [] })
        .expect(201);

      expect(res.body.subscriptions).toHaveLength(2);
    });
  });

  // ─── DELETE /admin/boards/:boardId/subscriptions/:subId ────────────

  describe('DELETE /admin/boards/:boardId/subscriptions/:subId', () => {
    it('should remove a subscription', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const board = await createBoard(accessToken);

      const addRes = await e2e.agent
        .post(`/admin/boards/${board.boardId}/subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ triggerId: 'item.moderation-requested', filters: [] })
        .expect(201);

      const subId = addRes.body.subscriptions[0].id;

      await e2e.agent
        .delete(`/admin/boards/${board.boardId}/subscriptions/${subId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });
  });

  // ─── POST /admin/boards/:boardId/members ───────────────────────────

  describe('POST /admin/boards/:boardId/members', () => {
    it('should add a member to a board', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const { userId } = await registerUser(e2e.agent, FIXED_OTP);
      const board = await createBoard(accessToken);

      const res = await e2e.agent
        .post(`/admin/boards/${board.boardId}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ userId })
        .expect(201);

      expect(res.body.memberIds).toContain(userId);
    });
  });

  // ─── DELETE /admin/boards/:boardId/members/:userId ────────────────

  describe('DELETE /admin/boards/:boardId/members/:userId', () => {
    it('should remove a member from a board', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const { userId } = await registerUser(e2e.agent, FIXED_OTP);
      const board = await createBoard(accessToken);

      await e2e.agent
        .post(`/admin/boards/${board.boardId}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ userId })
        .expect(201);

      await e2e.agent
        .delete(`/admin/boards/${board.boardId}/members/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });
  });

  // ─── PUT /admin/boards/:boardId/automation ─────────────────────────

  describe('PUT /admin/boards/:boardId/automation', () => {
    it('should add automation to a board', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const board = await createBoard(accessToken);

      const res = await e2e.agent
        .put(`/admin/boards/${board.boardId}/automation`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          agentId: 'agent-1',
          systemPrompt: 'You are a moderation assistant',
          onUncertainMoveToBoardId: null,
        })
        .expect(200);

      expect(res.body.automations).toHaveLength(1);
      expect(res.body.automations[0].agentId).toBe('agent-1');
      expect(res.body.automations[0].systemPrompt).toBe('You are a moderation assistant');
    });
  });

  // ─── DELETE /admin/boards/:boardId/automation/:automationId ────────

  describe('DELETE /admin/boards/:boardId/automation/:automationId', () => {
    it('should remove automation from a board', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const board = await createBoard(accessToken);

      const addRes = await e2e.agent
        .put(`/admin/boards/${board.boardId}/automation`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          agentId: 'agent-1',
          systemPrompt: 'Prompt',
          onUncertainMoveToBoardId: null,
        })
        .expect(200);

      const automationId = addRes.body.automations[0].id;

      await e2e.agent
        .delete(`/admin/boards/${board.boardId}/automation/${automationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });
  });

  // ─── GET /admin/boards/triggers ────────────────────────────────────

  describe('GET /admin/boards/triggers', () => {
    it('should return list of triggers', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .get('/admin/boards/triggers')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBeGreaterThanOrEqual(2);

      const triggerIds = res.body.map((t: { triggerId: string }) => t.triggerId);
      expect(triggerIds).toContain('item.moderation-requested');
      expect(triggerIds).toContain('organization.moderation-requested');
    });

    it('should filter triggers by scope', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .get('/admin/boards/triggers?scope=platform')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      for (const trigger of res.body) {
        expect(trigger.scope).toBe('platform');
      }
    });
  });
});

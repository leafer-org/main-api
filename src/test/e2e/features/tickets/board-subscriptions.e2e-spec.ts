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

describe('Board Subscriptions', () => {
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

  // ─── CRUD подписки открытия ────────────────────────────────────────

  describe('CRUD подписки открытия', () => {
    it('Добавление подписки с валидным triggerId и фильтрами', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const board = await createBoard(accessToken);

      const res = await e2e.agent
        .post(`/admin/boards/${board.boardId}/subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ triggerId: 'item-moderation.requested', filters: [] })
        .expect(201);

      expect(res.body.subscriptions).toHaveLength(1);
      expect(res.body.subscriptions[0].triggerId).toBe('item-moderation.requested');
      expect(res.body.subscriptions[0].id).toBeDefined();
    });

    it('Невалидный triggerId — ошибка 400', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const board = await createBoard(accessToken);

      await e2e.agent
        .post(`/admin/boards/${board.boardId}/subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ triggerId: 'invalid.trigger', filters: [] })
        .expect(400);
    });

    it('Удаление подписки по id, несуществующая — 404', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const board = await createBoard(accessToken);

      // Add then remove
      const addRes = await e2e.agent
        .post(`/admin/boards/${board.boardId}/subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ triggerId: 'item-moderation.requested', filters: [] })
        .expect(201);

      const subId = addRes.body.subscriptions[0].id;

      await e2e.agent
        .delete(`/admin/boards/${board.boardId}/subscriptions/${subId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // Non-existent
      await e2e.agent
        .delete(`/admin/boards/${board.boardId}/subscriptions/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  // ─── CRUD подписки закрытия ────────────────────────────────────────

  describe('CRUD подписки закрытия', () => {
    it('POST /admin/boards/:boardId/close-subscriptions создаёт подписку закрытия', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const board = await createBoard(accessToken);

      const res = await e2e.agent
        .post(`/admin/boards/${board.boardId}/close-subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ triggerId: 'item-moderation.approved', filters: [], addComment: true })
        .expect(201);

      expect(res.body.closeSubscriptions).toHaveLength(1);
      expect(res.body.closeSubscriptions[0].triggerId).toBe('item-moderation.approved');
      expect(res.body.closeSubscriptions[0].addComment).toBe(true);
    });

    it('DELETE /admin/boards/:boardId/close-subscriptions/:id удаляет подписку', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const board = await createBoard(accessToken);

      const addRes = await e2e.agent
        .post(`/admin/boards/${board.boardId}/close-subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ triggerId: 'item-moderation.approved', filters: [], addComment: false })
        .expect(201);

      const subId = addRes.body.closeSubscriptions[0].id;

      await e2e.agent
        .delete(`/admin/boards/${board.boardId}/close-subscriptions/${subId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });

    it('addComment=true — при срабатывании в историю тикета добавляется комментарий', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const board = await createBoard(accessToken);

      const res = await e2e.agent
        .post(`/admin/boards/${board.boardId}/close-subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ triggerId: 'item-moderation.rejected', filters: [], addComment: true })
        .expect(201);

      expect(res.body.closeSubscriptions[0].addComment).toBe(true);
    });
  });

  // ─── CRUD подписки перенаправления ────────────────────────────────

  describe('CRUD подписки перенаправления', () => {
    it('POST /admin/boards/:boardId/redirect-subscriptions создаёт подписку перенаправления', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const boardA = await createBoard(accessToken, 'Board A');
      const boardB = await createBoard(accessToken, 'Board B');

      const res = await e2e.agent
        .post(`/admin/boards/${boardA.boardId}/redirect-subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          triggerId: 'item-moderation.rejected',
          filters: [],
          targetBoardId: boardB.boardId,
          addComment: true,
          commentTemplate: 'Перенаправлен',
        })
        .expect(201);

      expect(res.body.redirectSubscriptions).toHaveLength(1);
      expect(res.body.redirectSubscriptions[0].targetBoardId).toBe(boardB.boardId);
      expect(res.body.redirectSubscriptions[0].commentTemplate).toBe('Перенаправлен');
    });

    it('DELETE /admin/boards/:boardId/redirect-subscriptions/:id удаляет подписку', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const boardA = await createBoard(accessToken, 'Board A');
      const boardB = await createBoard(accessToken, 'Board B');

      const addRes = await e2e.agent
        .post(`/admin/boards/${boardA.boardId}/redirect-subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          triggerId: 'item-moderation.rejected',
          filters: [],
          targetBoardId: boardB.boardId,
          addComment: false,
          commentTemplate: '',
        })
        .expect(201);

      const subId = addRes.body.redirectSubscriptions[0].id;

      await e2e.agent
        .delete(`/admin/boards/${boardA.boardId}/redirect-subscriptions/${subId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });

    it('addComment=true + commentTemplate → комментарий из шаблона', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const boardA = await createBoard(accessToken, 'Board A');
      const boardB = await createBoard(accessToken, 'Board B');

      const res = await e2e.agent
        .post(`/admin/boards/${boardA.boardId}/redirect-subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          triggerId: 'item-moderation.rejected',
          filters: [],
          targetBoardId: boardB.boardId,
          addComment: true,
          commentTemplate: 'Отправлен на ревью',
        })
        .expect(201);

      expect(res.body.redirectSubscriptions[0].addComment).toBe(true);
      expect(res.body.redirectSubscriptions[0].commentTemplate).toBe('Отправлен на ревью');
    });
  });

  // ─── API справочника триггеров ────────────────────────────────────

  describe('API справочника триггеров', () => {
    it('GET /admin/boards/triggers — список с triggerId, name, categories, params', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .get('/admin/boards/triggers')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBeGreaterThanOrEqual(8);

      const trigger = res.body.find((t: { triggerId: string }) => t.triggerId === 'item-moderation.requested');
      expect(trigger).toBeDefined();
      expect(trigger.categories).toContain('open');
      expect(trigger.params).toEqual([]);

      const timer = res.body.find((t: { triggerId: string }) => t.triggerId === 'timer.since-created');
      expect(timer).toBeDefined();
      expect(timer.categories).toContain('close');
      expect(timer.categories).toContain('redirect');
      expect(timer.params).toHaveLength(1);
      expect(timer.params[0].key).toBe('duration');
    });
  });

  // ─── API справочника фильтров ─────────────────────────────────────

  describe('API справочника фильтров', () => {
    it('GET /admin/boards/filters — список с type, name, categories, params', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .get('/admin/boards/filters')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBeGreaterThanOrEqual(3);

      const jsonLogic = res.body.find((f: { type: string }) => f.type === 'json-logic');
      expect(jsonLogic).toBeDefined();
      expect(jsonLogic.categories).toContain('open');
      expect(jsonLogic.categories).toContain('close');
      expect(jsonLogic.categories).toContain('redirect');

      const everyNth = res.body.find((f: { type: string }) => f.type === 'every-nth');
      expect(everyNth).toBeDefined();
      expect(everyNth.categories).toContain('open');
      expect(everyNth.params).toHaveLength(1);
      expect(everyNth.params[0].key).toBe('n');
    });
  });

});

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
const FAKE_UUID = '00000000-0000-0000-0000-000000000000';
const FAKE_ORG_UUID = '11111111-1111-1111-1111-111111111111';

describe('Board Management', () => {
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

  // ─── Создание доски ────────────────────────────────────────────────

  describe('Создание доски', () => {
    it('POST /admin/boards создаёт доску с валидными полями', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const board = await createBoard(accessToken, {
        name: 'My Board',
        description: 'Some description',
        scope: 'platform',
        organizationId: null,
        manualCreation: true,
      });

      expect(board.boardId).toBeDefined();
      expect(board.name).toBe('My Board');
      expect(board.description).toBe('Some description');
      expect(board.scope).toBe('platform');
      expect(board.organizationId).toBeNull();
      expect(board.manualCreation).toBe(true);
      expect(board.allowedTransferBoardIds).toEqual([]);
      expect(board.memberIds).toEqual([]);
      expect(board.subscriptions).toEqual([]);
      expect(board.closeSubscriptions).toEqual([]);
      expect(board.redirectSubscriptions).toEqual([]);
      expect(board.automations).toEqual([]);
      expect(board.createdAt).toBeDefined();
      expect(board.updatedAt).toBeDefined();
    });

    it('Создание доски scope=platform с organizationId=null', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const board = await createBoard(accessToken, {
        scope: 'platform',
        organizationId: null,
      });

      expect(board.scope).toBe('platform');
      expect(board.organizationId).toBeNull();
    });

    it('Создание доски scope=organization с organizationId', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const board = await createBoard(accessToken, {
        scope: 'organization',
        organizationId: FAKE_ORG_UUID,
      });

      expect(board.scope).toBe('organization');
      expect(board.organizationId).toBe(FAKE_ORG_UUID);
    });
  });

  // ─── Чтение досок ─────────────────────────────────────────────────

  describe('Чтение досок', () => {
    it('GET /admin/boards возвращает список всех досок', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      await createBoard(accessToken, { name: 'Board A' });
      await createBoard(accessToken, { name: 'Board B' });

      const res = await e2e.agent
        .get('/admin/boards')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBe(2);

      for (const board of res.body) {
        expect(board.boardId).toBeDefined();
        expect(board.name).toBeDefined();
        expect(board.scope).toBeDefined();
        expect(board.createdAt).toBeDefined();
        expect(board.subscriptionCount).toBeDefined();
        expect(board.memberCount).toBeDefined();
        expect(board.automationCount).toBeDefined();
      }
    });

    it('GET /admin/boards?scope=platform фильтрует по scope', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      await createBoard(accessToken, { name: 'Platform Board', scope: 'platform' });
      await createBoard(accessToken, {
        name: 'Org Board',
        scope: 'organization',
        organizationId: FAKE_ORG_UUID,
      });

      const res = await e2e.agent
        .get('/admin/boards?scope=platform')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.length).toBe(1);
      expect(res.body[0].name).toBe('Platform Board');
      expect(res.body[0].scope).toBe('platform');
    });

    it('GET /admin/boards?scope=organization фильтрует по scope', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      await createBoard(accessToken, { name: 'Platform Board', scope: 'platform' });
      await createBoard(accessToken, {
        name: 'Org Board',
        scope: 'organization',
        organizationId: FAKE_ORG_UUID,
      });

      const res = await e2e.agent
        .get('/admin/boards?scope=organization')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.length).toBe(1);
      expect(res.body[0].name).toBe('Org Board');
      expect(res.body[0].scope).toBe('organization');
    });

    it('GET /admin/boards/:boardId возвращает полные данные доски', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const created = await createBoard(accessToken, {
        name: 'Detail Board',
        description: 'Detailed',
        manualCreation: true,
      });

      const res = await e2e.agent
        .get(`/admin/boards/${created.boardId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.boardId).toBe(created.boardId);
      expect(res.body.name).toBe('Detail Board');
      expect(res.body.description).toBe('Detailed');
      expect(res.body.manualCreation).toBe(true);
      expect(res.body.allowedTransferBoardIds).toEqual([]);
      expect(res.body.memberIds).toEqual([]);
      expect(res.body.members).toBeInstanceOf(Array);
      expect(res.body.subscriptions).toEqual([]);
      expect(res.body.closeSubscriptions).toEqual([]);
      expect(res.body.redirectSubscriptions).toEqual([]);
      expect(res.body.automations).toEqual([]);
      expect(res.body.createdAt).toBeDefined();
      expect(res.body.updatedAt).toBeDefined();
    });

    it('GET /admin/boards/:boardId — несуществующая доска — 404', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      await e2e.agent
        .get(`/admin/boards/${FAKE_UUID}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  // ─── Обновление доски ──────────────────────────────────────────────

  describe('Обновление доски', () => {
    it('PATCH /admin/boards/:boardId обновляет name, description, manualCreation, allowedTransferBoardIds', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const board = await createBoard(accessToken, {
        name: 'Original',
        manualCreation: false,
      });

      const target = await createBoard(accessToken, { name: 'Target Board' });

      const res = await e2e.agent
        .patch(`/admin/boards/${board.boardId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Updated',
          description: 'New description',
          manualCreation: true,
          allowedTransferBoardIds: [target.boardId],
        })
        .expect(200);

      expect(res.body.name).toBe('Updated');
      expect(res.body.description).toBe('New description');
      expect(res.body.manualCreation).toBe(true);
      expect(res.body.allowedTransferBoardIds).toEqual([target.boardId]);
      // scope and organizationId should remain unchanged
      expect(res.body.scope).toBe('platform');
      expect(res.body.organizationId).toBeNull();
    });

    it('allowedTransferBoardIds обновляется целиком (replace, не append)', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const board = await createBoard(accessToken, { name: 'Main Board' });
      const boardA = await createBoard(accessToken, { name: 'Board A' });
      const boardB = await createBoard(accessToken, { name: 'Board B' });

      // Set allowedTransferBoardIds to [boardA]
      await e2e.agent
        .patch(`/admin/boards/${board.boardId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Main Board',
          description: null,
          manualCreation: false,
          allowedTransferBoardIds: [boardA.boardId],
        })
        .expect(200);

      // Replace with [boardB]
      const res = await e2e.agent
        .patch(`/admin/boards/${board.boardId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Main Board',
          description: null,
          manualCreation: false,
          allowedTransferBoardIds: [boardB.boardId],
        })
        .expect(200);

      expect(res.body.allowedTransferBoardIds).toEqual([boardB.boardId]);
    });

    it('PATCH /admin/boards/:boardId — несуществующая доска — 404', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      await e2e.agent
        .patch(`/admin/boards/${FAKE_UUID}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Ghost',
          description: null,
          manualCreation: false,
          allowedTransferBoardIds: [],
        })
        .expect(404);
    });
  });

  // ─── Удаление доски ────────────────────────────────────────────────

  describe('Удаление доски', () => {
    it('DELETE /admin/boards/:boardId удаляет доску, возвращает 204', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const board = await createBoard(accessToken, { name: 'To Delete' });

      await e2e.agent
        .delete(`/admin/boards/${board.boardId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // Verify board no longer exists
      await e2e.agent
        .get(`/admin/boards/${board.boardId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('DELETE /admin/boards/:boardId — несуществующая доска — 404', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      await e2e.agent
        .delete(`/admin/boards/${FAKE_UUID}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});

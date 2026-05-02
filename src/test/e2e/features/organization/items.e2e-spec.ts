import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loginAsAdmin, registerUser } from '../../actors/auth.js';
import { createItem, createItemType, createOrganization } from '../../actors/organization.js';
import { startContainers, stopContainers } from '../../helpers/containers.js';
import { type E2eApp } from '../../helpers/create-app.js';
import { runMigrations, seedAdminUser, seedStaticRoles, truncateAll } from '../../helpers/db.js';
import { waitForAllConsumers } from '../../helpers/kafka.js';
import { flushOutbox } from '../../helpers/outbox.js';
import { createBuckets } from '../../helpers/s3.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';

const FIXED_OTP = '123456';

describe('organization-items', () => {
  let e2e: E2eApp;
  let adminToken: string;

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
    await waitForAllConsumers(app);

    e2e = {
      app,
      agent: request(app.getHttpServer()),
    };
  });

  beforeEach(async () => {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await seedStaticRoles(process.env.DB_URL);
    await seedAdminUser(process.env.DB_URL);

    const auth = await loginAsAdmin(e2e.agent, FIXED_OTP);
    adminToken = auth.accessToken;
  });

  afterEach(async () => {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await truncateAll(process.env.DB_URL);
  });

  afterAll(async () => {
    await e2e?.app.close();
    await stopContainers();
  });

  // ─── POST /organizations/:orgId/items ─────────────────────────────

  describe('POST /organizations/:orgId/items', () => {
    it('создаёт item с виджетами', async () => {
      const user = await registerUser(e2e.agent, FIXED_OTP);
      const org = await createOrganization(e2e.agent, user.accessToken);
      const itemType = await createItemType(e2e.agent, adminToken);

      const item = await createItem(e2e.agent, user.accessToken, org.id, itemType.id);

      expect(item.itemId).toBeDefined();
      expect(item.organizationId).toBe(org.id);
      expect(item.typeId).toBe(itemType.id);
      expect(item.draft).toBeDefined();
      expect(item.draft.status).toBe('draft');
      expect(item.draft.widgets.length).toBeGreaterThanOrEqual(1);
      expect(item.draft.widgets.some((w: { type: string }) => w.type === 'base-info')).toBe(true);
      expect(item.publication).toBeNull();
    });

    it('возвращает 403 для не-сотрудника', async () => {
      const owner = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000010' });
      const org = await createOrganization(e2e.agent, owner.accessToken);
      const itemType = await createItemType(e2e.agent, adminToken);

      const other = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000011' });

      await e2e.agent
        .post(`/organizations/${org.id}/items`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .send({
          typeId: itemType.id,
          widgets: [{ type: 'base-info', title: 'T', description: 'D', media: [] }],
        })
        .expect(403);
    });
  });

  // ─── GET /organizations/:orgId/items ──────────────────────────────

  describe('GET /organizations/:orgId/items', () => {
    it('возвращает список item-ов организации', async () => {
      const user = await registerUser(e2e.agent, FIXED_OTP);
      const org = await createOrganization(e2e.agent, user.accessToken);
      const itemType = await createItemType(e2e.agent, adminToken);

      await createItem(e2e.agent, user.accessToken, org.id, itemType.id);
      await createItem(e2e.agent, user.accessToken, org.id, itemType.id);

      const res = await e2e.agent
        .get(`/organizations/${org.id}/items`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0]).toHaveProperty('itemId');
      expect(res.body.items[0]).toHaveProperty('typeId');
      expect(res.body.items[0].hasDraft).toBe(true);
      expect(res.body.items[0].draftStatus).toBe('draft');
      expect(res.body).toHaveProperty('nextCursor');
    });

    it('возвращает пустой список для организации без item-ов', async () => {
      const user = await registerUser(e2e.agent, FIXED_OTP);
      const org = await createOrganization(e2e.agent, user.accessToken);

      const res = await e2e.agent
        .get(`/organizations/${org.id}/items`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(0);
      expect(res.body.nextCursor).toBeNull();
    });
  });

  // ─── GET /organizations/:orgId/items/:itemId ──────────────────────

  describe('GET /organizations/:orgId/items/:itemId', () => {
    it('возвращает карточку item-а', async () => {
      const user = await registerUser(e2e.agent, FIXED_OTP);
      const org = await createOrganization(e2e.agent, user.accessToken);
      const itemType = await createItemType(e2e.agent, adminToken);
      const item = await createItem(e2e.agent, user.accessToken, org.id, itemType.id);

      const res = await e2e.agent
        .get(`/organizations/${org.id}/items/${item.itemId}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(res.body.itemId).toBe(item.itemId);
      expect(res.body.draft).toBeDefined();
      expect(res.body.draft.widgets[0].title).toBe('Test Item');
    });

    it('возвращает 404 для несуществующего item-а', async () => {
      const user = await registerUser(e2e.agent, FIXED_OTP);
      const org = await createOrganization(e2e.agent, user.accessToken);

      await e2e.agent
        .get(`/organizations/${org.id}/items/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(404);
    });
  });

  // ─── PATCH /organizations/:orgId/items/:itemId ────────────────────

  describe('PATCH /organizations/:orgId/items/:itemId', () => {
    it('обновляет виджеты draft-а', async () => {
      const user = await registerUser(e2e.agent, FIXED_OTP);
      const org = await createOrganization(e2e.agent, user.accessToken);
      const itemType = await createItemType(e2e.agent, adminToken);
      const item = await createItem(e2e.agent, user.accessToken, org.id, itemType.id);

      const res = await e2e.agent
        .patch(`/organizations/${org.id}/items/${item.itemId}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          widgets: [
            { type: 'base-info', title: 'Updated Title', description: 'Updated desc', media: [] },
          ],
        })
        .expect(200);

      expect(res.body.draft.widgets[0].title).toBe('Updated Title');
    });
  });

  // ─── DELETE /organizations/:orgId/items/:itemId ───────────────────

  describe('DELETE /organizations/:orgId/items/:itemId', () => {
    it('удаляет draft item-а', async () => {
      const user = await registerUser(e2e.agent, FIXED_OTP);
      const org = await createOrganization(e2e.agent, user.accessToken);
      const itemType = await createItemType(e2e.agent, adminToken);
      const item = await createItem(e2e.agent, user.accessToken, org.id, itemType.id);

      await e2e.agent
        .delete(`/organizations/${org.id}/items/${item.itemId}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(204);

      // Verify item is gone
      await e2e.agent
        .get(`/organizations/${org.id}/items/${item.itemId}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(404);
    });
  });

  // ─── POST /organizations/:orgId/items/:itemId/submit-for-moderation

  describe('POST /organizations/:orgId/items/:itemId/submit-for-moderation', () => {
    it('отправляет item на модерацию', async () => {
      const user = await registerUser(e2e.agent, FIXED_OTP);
      const org = await createOrganization(e2e.agent, user.accessToken);
      const itemType = await createItemType(e2e.agent, adminToken);
      const item = await createItem(e2e.agent, user.accessToken, org.id, itemType.id);

      await e2e.agent
        .post(`/organizations/${org.id}/items/${item.itemId}/submit-for-moderation`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(204);

      await flushOutbox(e2e.app);

      // Verify status changed
      const res = await e2e.agent
        .get(`/organizations/${org.id}/items/${item.itemId}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(res.body.draft.status).toBe('moderation-request');
    });

    it('возвращает 403 для не-сотрудника', async () => {
      const owner = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000010' });
      const org = await createOrganization(e2e.agent, owner.accessToken);
      const itemType = await createItemType(e2e.agent, adminToken);
      const item = await createItem(e2e.agent, owner.accessToken, org.id, itemType.id);

      const other = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000011' });

      await e2e.agent
        .post(`/organizations/${org.id}/items/${item.itemId}/submit-for-moderation`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(403);
    });
  });

  // ─── POST /organizations/:orgId/items/:itemId/unpublish ───────────

  describe('POST /organizations/:orgId/items/:itemId/unpublish', () => {
    it('возвращает ошибку если у item-а нет publication', async () => {
      const user = await registerUser(e2e.agent, FIXED_OTP);
      const org = await createOrganization(e2e.agent, user.accessToken);
      const itemType = await createItemType(e2e.agent, adminToken);
      const item = await createItem(e2e.agent, user.accessToken, org.id, itemType.id);

      const res = await e2e.agent
        .post(`/organizations/${org.id}/items/${item.itemId}/unpublish`)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res.status).toBe(400);
    });

    it.todo('снимает с публикации опубликованный item');
  });
});

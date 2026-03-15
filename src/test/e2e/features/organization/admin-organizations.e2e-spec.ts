import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loginAsAdmin, registerUser } from '../../actors/auth.js';
import { createItemType, createOrganization } from '../../actors/organization.js';
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

describe('Admin Organizations (e2e)', () => {
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
  });

  afterEach(async () => {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await truncateAll(process.env.DB_URL);
  });

  afterAll(async () => {
    await e2e?.app.close();
    await stopContainers();
  });

  // ─── POST /admin/organizations ──────────────────────────────────

  describe('POST /admin/organizations', () => {
    it('should create organization with claim token', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .post('/admin/organizations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Admin Org', description: 'Created by admin' })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.claimToken).toBeDefined();
    });

    it('should return 403 for regular user', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);

      await e2e.agent
        .post('/admin/organizations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Org', description: 'desc' })
        .expect(403);
    });
  });

  // ─── POST /admin/organizations/:id/regenerate-token ─────────────

  describe('POST /admin/organizations/:id/regenerate-token', () => {
    it('should regenerate claim token', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const createRes = await e2e.agent
        .post('/admin/organizations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Org', description: 'desc' })
        .expect(201);

      const oldToken = createRes.body.claimToken;

      const res = await e2e.agent
        .post(`/admin/organizations/${createRes.body.id}/regenerate-token`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.claimToken).toBeDefined();
      expect(res.body.claimToken).not.toBe(oldToken);
    });

    it('should return 403 for regular user', async () => {
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const createRes = await e2e.agent
        .post('/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Org', description: 'desc' })
        .expect(201);

      const { accessToken: userToken } = await registerUser(e2e.agent, FIXED_OTP);

      await e2e.agent
        .post(`/admin/organizations/${createRes.body.id}/regenerate-token`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });

  // ─── POST /organizations/claim ──────────────────────────────────

  describe('POST /organizations/claim', () => {
    it('should claim organization by token', async () => {
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const createRes = await e2e.agent
        .post('/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Claimable Org', description: 'desc' })
        .expect(201);

      const { accessToken: userToken, userId } = await registerUser(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .post('/organizations/claim')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ token: createRes.body.claimToken })
        .expect(200);

      expect(res.body.id).toBe(createRes.body.id);
      expect(res.body.infoDraft.name).toBe('Claimable Org');
      expect(res.body.employees).toHaveLength(1);
      expect(res.body.employees[0]).toMatchObject({ userId, isOwner: true });
    });

    it('should return 400 for invalid token', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);

      await e2e.agent
        .post('/organizations/claim')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ token: '00000000-0000-0000-0000-000000000000' })
        .expect(400);
    });

    it('should return 400 when claiming already claimed org', async () => {
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const createRes = await e2e.agent
        .post('/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Org', description: 'desc' })
        .expect(201);

      const user1 = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000010' });
      await e2e.agent
        .post('/organizations/claim')
        .set('Authorization', `Bearer ${user1.accessToken}`)
        .send({ token: createRes.body.claimToken })
        .expect(200);

      const user2 = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000011' });
      await e2e.agent
        .post('/organizations/claim')
        .set('Authorization', `Bearer ${user2.accessToken}`)
        .send({ token: createRes.body.claimToken })
        .expect(400);
    });
  });

  // ─── Admin access to organization endpoints ─────────────────────

  describe('Admin access to org endpoints (ORGANIZATION.MANAGE bypass)', () => {
    it('admin should view any organization detail without being employee', async () => {
      const owner = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000010' });
      const org = await createOrganization(e2e.agent, owner.accessToken);

      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .get(`/organizations/${org.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.id).toBe(org.id);
    });

    it('admin should update info draft without being employee', async () => {
      const owner = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000010' });
      const org = await createOrganization(e2e.agent, owner.accessToken);

      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .patch(`/organizations/${org.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Admin Updated', description: 'By admin', avatarId: null })
        .expect(200);

      expect(res.body.infoDraft.name).toBe('Admin Updated');
    });

    it('admin should delete organization without being employee', async () => {
      const owner = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000010' });
      const org = await createOrganization(e2e.agent, owner.accessToken);

      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      await e2e.agent
        .delete(`/organizations/${org.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify deleted
      await e2e.agent
        .get(`/organizations/${org.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });
  });

  // ─── Moderation with admin access ───────────────────────────────

  describe('Moderation (ORGANIZATION.MODERATE + ORGANIZATION.MANAGE)', () => {
    it('admin should approve info moderation', async () => {
      const owner = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000010' });
      const org = await createOrganization(e2e.agent, owner.accessToken);

      // Submit for moderation as owner
      await e2e.agent
        .post(`/organizations/${org.id}/submit-for-moderation`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(204);

      await flushOutbox(e2e.app);

      // Approve as admin
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      await e2e.agent
        .post(`/organizations/${org.id}/approve-moderation`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await flushOutbox(e2e.app);

      // Verify published
      const res = await e2e.agent
        .get(`/organizations/${org.id}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);

      expect(res.body.infoDraft.status).toBe('draft');
      expect(res.body.infoPublication).not.toBeNull();
      expect(res.body.infoPublication.name).toBe('Test Organization');
    });

    it('admin should reject info moderation', async () => {
      const owner = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000010' });
      const org = await createOrganization(e2e.agent, owner.accessToken);

      await e2e.agent
        .post(`/organizations/${org.id}/submit-for-moderation`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(204);

      await flushOutbox(e2e.app);

      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      await e2e.agent
        .post(`/organizations/${org.id}/reject-moderation`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const res = await e2e.agent
        .get(`/organizations/${org.id}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);

      expect(res.body.infoDraft.status).toBe('rejected');
    });

    it('regular user should not be able to approve moderation', async () => {
      const owner = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000010' });
      const org = await createOrganization(e2e.agent, owner.accessToken);

      await e2e.agent
        .post(`/organizations/${org.id}/submit-for-moderation`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(204);

      await flushOutbox(e2e.app);

      const other = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000011' });

      await e2e.agent
        .post(`/organizations/${org.id}/approve-moderation`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(403);
    });
  });

  // ─── POST /admin/organizations/:orgId/items ────────────────────────

  describe('POST /admin/organizations/:orgId/items', () => {
    it('should create item bypassing plan limits', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const createRes = await e2e.agent
        .post('/admin/organizations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Org for items', description: 'desc' })
        .expect(201);

      const orgId = createRes.body.id;

      const itemType = await createItemType(e2e.agent, accessToken, {
        availableWidgetTypes: ['base-info', 'schedule', 'event-date-time'],
        requiredWidgetTypes: ['base-info'],
      });

      const res = await e2e.agent
        .post(`/admin/organizations/${orgId}/items`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          typeId: itemType.id,
          widgets: [
            { type: 'base-info', data: { title: 'Admin Item', description: 'Created by admin', media: [] } },
            { type: 'schedule', data: { entries: [{ dayOfWeek: 1, startTime: '09:00', endTime: '18:00' }] } },
          ],
        })
        .expect(201);

      expect(res.body.itemId).toBeDefined();
      expect(res.body.organizationId).toBe(orgId);
      expect(res.body.typeId).toBe(itemType.id);
      expect(res.body.draft).toBeDefined();
      expect(res.body.draft.status).toBe('draft');
      expect(res.body.draft.widgets).toHaveLength(2);
      expect(res.body.draft.widgets[0].type).toBe('base-info');
      expect(res.body.draft.widgets[1].type).toBe('schedule');
      expect(res.body.publication).toBeNull();
    });

    it('should return 403 for regular user', async () => {
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const createRes = await e2e.agent
        .post('/admin/organizations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Org', description: 'desc' })
        .expect(201);

      const itemType = await createItemType(e2e.agent, adminToken);

      const { accessToken: userToken } = await registerUser(e2e.agent, FIXED_OTP);

      await e2e.agent
        .post(`/admin/organizations/${createRes.body.id}/items`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          typeId: itemType.id,
          widgets: [{ type: 'base-info', data: { title: 'T', description: 'D', media: [] } }],
        })
        .expect(403);
    });

    it('should return 404 for non-existent organization', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const itemType = await createItemType(e2e.agent, accessToken);

      await e2e.agent
        .post('/admin/organizations/00000000-0000-0000-0000-000000000000/items')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          typeId: itemType.id,
          widgets: [{ type: 'base-info', data: { title: 'T', description: 'D', media: [] } }],
        })
        .expect(404);
    });

    it('should return 404 for non-existent item type', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const createRes = await e2e.agent
        .post('/admin/organizations')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Org', description: 'desc' })
        .expect(201);

      await e2e.agent
        .post(`/admin/organizations/${createRes.body.id}/items`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          typeId: '00000000-0000-0000-0000-000000000000',
          widgets: [{ type: 'base-info', data: { title: 'T', description: 'D', media: [] } }],
        })
        .expect(404);
    });
  });

  // ─── POST /organizations/:id/unpublish ──────────────────────────

  describe('POST /organizations/:id/unpublish', () => {
    async function publishOrganization(ownerToken: string, adminToken: string, orgId: string) {
      await e2e.agent
        .post(`/organizations/${orgId}/submit-for-moderation`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);
      await flushOutbox(e2e.app);

      await e2e.agent
        .post(`/organizations/${orgId}/approve-moderation`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
      await flushOutbox(e2e.app);
    }

    it('owner should unpublish organization', async () => {
      const owner = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000010' });
      const org = await createOrganization(e2e.agent, owner.accessToken);
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      await publishOrganization(owner.accessToken, adminToken, org.id);

      // Verify published
      let res = await e2e.agent
        .get(`/organizations/${org.id}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(res.body.infoPublication).not.toBeNull();

      // Unpublish
      await e2e.agent
        .post(`/organizations/${org.id}/unpublish`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(204);

      await flushOutbox(e2e.app);

      // Verify unpublished
      res = await e2e.agent
        .get(`/organizations/${org.id}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(res.body.infoPublication).toBeNull();
    });

    it('admin should unpublish any organization', async () => {
      const owner = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000010' });
      const org = await createOrganization(e2e.agent, owner.accessToken);
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      await publishOrganization(owner.accessToken, adminToken, org.id);

      await e2e.agent
        .post(`/organizations/${org.id}/unpublish`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await flushOutbox(e2e.app);

      const res = await e2e.agent
        .get(`/organizations/${org.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.infoPublication).toBeNull();
    });

    it('should return 400 when organization is not published', async () => {
      const owner = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000010' });
      const org = await createOrganization(e2e.agent, owner.accessToken);

      await e2e.agent
        .post(`/organizations/${org.id}/unpublish`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(400);
    });

    it('should return 403 for non-employee', async () => {
      const owner = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000010' });
      const org = await createOrganization(e2e.agent, owner.accessToken);

      const other = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000011' });

      await e2e.agent
        .post(`/organizations/${org.id}/unpublish`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(403);
    });
  });
});

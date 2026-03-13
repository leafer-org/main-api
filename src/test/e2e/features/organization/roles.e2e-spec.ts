import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { registerUser } from '../../actors/auth.js';
import { createOrganization } from '../../actors/organization.js';
import { startContainers, stopContainers } from '../../helpers/containers.js';
import { type E2eApp } from '../../helpers/create-app.js';
import { runMigrations, seedAdminUser, seedStaticRoles, truncateAll } from '../../helpers/db.js';
import { waitForAllConsumers } from '../../helpers/kafka.js';
import { createBuckets } from '../../helpers/s3.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';

const FIXED_OTP = '123456';

describe('Organization Roles (e2e)', () => {
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

  // ─── GET /organizations/:id/roles ─────────────────────────────────

  describe('GET /organizations/:id/roles', () => {
    it('should return ADMIN role after org creation', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);
      const org = await createOrganization(e2e.agent, accessToken);

      const res = await e2e.agent
        .get(`/organizations/${org.id}/roles`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('ADMIN');
      expect(res.body[0].permissions).toEqual(
        expect.arrayContaining([
          'manage_employees',
          'manage_roles',
          'edit_organization',
          'publish_organization',
          'edit_items',
          'publish_items',
          'unpublish_items',
          'manage_subscription',
        ]),
      );
    });
  });

  // ─── POST /organizations/:id/roles ────────────────────────────────

  describe('POST /organizations/:id/roles', () => {
    it('should create a custom role with specific permissions', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);
      const org = await createOrganization(e2e.agent, accessToken);

      const res = await e2e.agent
        .post(`/organizations/${org.id}/roles`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Editor',
          permissions: ['edit_items', 'edit_organization'],
        })
        .expect(201);

      expect(res.body).toMatchObject({
        name: 'Editor',
        permissions: ['edit_items', 'edit_organization'],
      });
      expect(res.body.id).toBeDefined();
    });

    it('should return 403 for non-employee', async () => {
      const owner = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000010' });
      const org = await createOrganization(e2e.agent, owner.accessToken);

      const other = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000011' });

      await e2e.agent
        .post(`/organizations/${org.id}/roles`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .send({ name: 'Hacker', permissions: ['manage_employees'] })
        .expect(403);
    });
  });

  // ─── PATCH /organizations/:id/roles/:roleId ───────────────────────

  describe('PATCH /organizations/:id/roles/:roleId', () => {
    it('should update role name and permissions', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);
      const org = await createOrganization(e2e.agent, accessToken);

      // Create a custom role first
      const createRes = await e2e.agent
        .post(`/organizations/${org.id}/roles`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Editor', permissions: ['edit_items'] })
        .expect(201);

      const roleId = createRes.body.id;

      const res = await e2e.agent
        .patch(`/organizations/${org.id}/roles/${roleId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Senior Editor',
          permissions: ['edit_items', 'publish_items'],
        })
        .expect(200);

      expect(res.body).toMatchObject({
        id: roleId,
        name: 'Senior Editor',
        permissions: ['edit_items', 'publish_items'],
      });
    });
  });

  // ─── DELETE /organizations/:id/roles/:roleId ──────────────────────

  describe('DELETE /organizations/:id/roles/:roleId', () => {
    it('should delete a custom role with replacement', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);
      const org = await createOrganization(e2e.agent, accessToken);
      const adminRoleId = org.roles[0].id;

      // Create a custom role
      const createRes = await e2e.agent
        .post(`/organizations/${org.id}/roles`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Temp Role', permissions: ['edit_items'] })
        .expect(201);

      const roleId = createRes.body.id;

      // Delete the custom role, replacing with ADMIN
      await e2e.agent
        .delete(`/organizations/${org.id}/roles/${roleId}?replacementRoleId=${adminRoleId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // Verify the role is gone
      const listRes = await e2e.agent
        .get(`/organizations/${org.id}/roles`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(listRes.body).toHaveLength(1);
      expect(listRes.body[0].name).toBe('ADMIN');
    });

    it('should not allow deleting the ADMIN role', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);
      const org = await createOrganization(e2e.agent, accessToken);
      const adminRoleId = org.roles[0].id;

      // Create a replacement role first
      const createRes = await e2e.agent
        .post(`/organizations/${org.id}/roles`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Replacement', permissions: ['edit_items'] })
        .expect(201);

      await e2e.agent
        .delete(
          `/organizations/${org.id}/roles/${adminRoleId}?replacementRoleId=${createRes.body.id}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });
  });
});

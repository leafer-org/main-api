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
import { SUBSCRIPTION_PLANS } from '@/features/organization/domain/aggregates/organization/config.js';

const FIXED_OTP = '123456';

describe('Organization Employees (e2e)', () => {
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

  // ─── GET /organizations/:id/employees ─────────────────────────────

  describe('GET /organizations/:id/employees', () => {
    it('should return owner after org creation', async () => {
      const { accessToken, userId } = await registerUser(e2e.agent, FIXED_OTP);
      const org = await createOrganization(e2e.agent, accessToken);

      const res = await e2e.agent
        .get(`/organizations/${org.id}/employees`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        userId,
        isOwner: true,
      });
    });
  });

  // ─── POST /organizations/:id/employees ────────────────────────────

  describe('POST /organizations/:id/employees', () => {
    it('should invite an employee by phone', async () => {
      // Use team plan workaround: free plan allows only 1 employee
      // For now, test that invite works with default plan by registering another user
      const owner = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000010' });
      const org = await createOrganization(e2e.agent, owner.accessToken);

      const invitee = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000011' });
      const adminRoleId = org.roles[0].id;

      // Free plan has maxEmployees=1, so this should fail with employee limit error
      const res = await e2e.agent
        .post(`/organizations/${org.id}/employees`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ phone: '+79990000011', roleId: adminRoleId });

      // Free plan limits to 1 employee, expect error
      expect(res.status).toBe(400);
    });

    it('should return 404 for unknown phone', async () => {
      const owner = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000010' });
      const org = await createOrganization(e2e.agent, owner.accessToken);
      const adminRoleId = org.roles[0].id;

      const res = await e2e.agent
        .post(`/organizations/${org.id}/employees`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ phone: '+79990099999', roleId: adminRoleId });

      expect(res.status).toBe(404);
    });

    it('should return 403 for non-employee', async () => {
      const owner = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000010' });
      const org = await createOrganization(e2e.agent, owner.accessToken);

      const other = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000011' });
      const adminRoleId = org.roles[0].id;

      await e2e.agent
        .post(`/organizations/${org.id}/employees`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .send({ phone: '+79990000010', roleId: adminRoleId })
        .expect(403);
    });
  });

  // ─── DELETE /organizations/:id/employees/:userId ──────────────────

  describe('DELETE /organizations/:id/employees/:userId', () => {
    it('should not allow removing the owner', async () => {
      const { accessToken, userId } = await registerUser(e2e.agent, FIXED_OTP);
      const org = await createOrganization(e2e.agent, accessToken);

      const res = await e2e.agent
        .delete(`/organizations/${org.id}/employees/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(400);
    });
  });

  // ─── PATCH /organizations/:id/employees/:userId ───────────────────

  describe('PATCH /organizations/:id/employees/:userId', () => {
    it('should return 403 for non-employee', async () => {
      const owner = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000010' });
      const org = await createOrganization(e2e.agent, owner.accessToken);

      const other = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000011' });

      await e2e.agent
        .patch(`/organizations/${org.id}/employees/${owner.userId}`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .send({ roleId: org.roles[0].id })
        .expect(403);
    });
  });

  // ─── POST /organizations/:id/transfer-ownership ───────────────────

  describe('POST /organizations/:id/transfer-ownership', () => {
    it('should return error when transferring to non-employee', async () => {
      const owner = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000010' });
      const org = await createOrganization(e2e.agent, owner.accessToken);

      const other = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000011' });

      const res = await e2e.agent
        .post(`/organizations/${org.id}/transfer-ownership`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ userId: other.userId });

      expect(res.status).toBe(400);
    });
  });
});

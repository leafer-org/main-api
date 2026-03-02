import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { startContainers, stopContainers } from './helpers/containers.js';
import { type E2eApp } from './helpers/create-app.js';
import {
  ADMIN_PHONE,
  runMigrations,
  seedAdminUser,
  seedStaticRoles,
  truncateAll,
} from './helpers/db.js';
import { flushOutbox } from './helpers/outbox.js';
import { createBuckets } from './helpers/s3.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';
import { PermissionsStore } from '@/infra/auth/permissions-store.js';

const FIXED_OTP = '123456';
const USER_PHONE = '+79990000002';

async function loginAsAdmin(agent: E2eApp['agent']) {
  const phone = `+${ADMIN_PHONE}`;

  await agent.post('/auth/request-otp').send({ phoneNumber: phone }).expect(200);

  const res = await agent
    .post('/auth/verify-otp')
    .send({ phoneNumber: phone, code: FIXED_OTP })
    .expect(200);

  expect(res.body.type).toBe('authenticated');

  return {
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
  };
}

async function registerRegularUser(
  agent: E2eApp['agent'],
  phone = USER_PHONE,
  fullName = 'Regular User',
) {
  await agent.post('/auth/request-otp').send({ phoneNumber: phone }).expect(200);

  const verifyRes = await agent
    .post('/auth/verify-otp')
    .send({ phoneNumber: phone, code: FIXED_OTP })
    .expect(200);

  expect(verifyRes.body.type).toBe('new_registration');

  const regRes = await agent
    .post('/auth/complete-profile')
    .send({ registrationSessionId: verifyRes.body.registrationSessionId, fullName })
    .expect(200);

  return {
    accessToken: regRes.body.accessToken as string,
    refreshToken: regRes.body.refreshToken as string,
    userId: regRes.body.user.id as string,
  };
}

/** Poll until the condition returns true, with a timeout */
async function waitFor(
  fn: () => Promise<boolean>,
  { timeoutMs = 10_000, intervalMs = 500 } = {},
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // biome-ignore lint/performance/noAwaitInLoops: Test
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

describe('Admin Users Controller (e2e)', () => {
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
    await e2e.app.get(PermissionsStore).refresh();
  });

  afterEach(async () => {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await truncateAll(process.env.DB_URL);
  });

  afterAll(async () => {
    await e2e?.app.close();
    await stopContainers();
  });

  // ─── GET /admin/users ──────────────────────────────────────────────

  describe('GET /admin/users', () => {
    it('should return 401 without auth token', async () => {
      await e2e.agent.get('/admin/users').expect(401);
    });

    it('should return 403 for user without USER.MANAGE permission', async () => {
      const { accessToken } = await registerRegularUser(e2e.agent);

      await e2e.agent.get('/admin/users').set('Authorization', `Bearer ${accessToken}`).expect(403);
    });

    it('should return empty results for admin', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent);

      const res = await e2e.agent
        .get('/admin/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('users');
      expect(res.body).toHaveProperty('total');
      expect(res.body.users).toBeInstanceOf(Array);
    });

    it('should find a registered user by name after projection', async () => {
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent);

      // Register a user — this triggers outbox → Kafka → MeiliSearch projection
      await registerRegularUser(e2e.agent, '+79990000003', 'Searchable User');
      await flushOutbox(e2e.app);

      // Wait for the projection to complete (async: Kafka consumer → MeiliSearch)
      await waitFor(async () => {
        const res = await e2e.agent
          .get('/admin/users')
          .query({ query: 'Searchable' })
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        return res.body.total > 0;
      });

      const res = await e2e.agent
        .get('/admin/users')
        .query({ query: 'Searchable' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.total).toBeGreaterThanOrEqual(1);

      const found = res.body.users.find(
        (u: { fullName: string }) => u.fullName === 'Searchable User',
      );
      expect(found).toBeDefined();
      expect(found).toHaveProperty('userId');
      expect(found).toHaveProperty('phoneNumber');
      expect(found).toHaveProperty('role');
      expect(found).toHaveProperty('createdAt');
      expect(found).toHaveProperty('updatedAt');
    });

    it('should support pagination with from and size', async () => {
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent);

      // Register multiple users
      await registerRegularUser(e2e.agent, '+79990000004', 'User Alpha');
      await registerRegularUser(e2e.agent, '+79990000005', 'User Beta');
      await flushOutbox(e2e.app);

      // Wait for projections (Kafka consumer → MeiliSearch)
      await waitFor(async () => {
        const res = await e2e.agent
          .get('/admin/users')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        return res.body.total >= 2;
      });

      // Fetch page with size=1
      const res = await e2e.agent
        .get('/admin/users')
        .query({ from: 0, size: 1 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.users).toHaveLength(1);
      expect(res.body.total).toBeGreaterThanOrEqual(2);
    });
  });
});

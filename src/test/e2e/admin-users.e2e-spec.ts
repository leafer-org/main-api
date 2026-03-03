import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { loginAsAdmin, registerUser } from './actors/auth.js';
import { startContainers, stopContainers } from './helpers/containers.js';
import { type E2eApp } from './helpers/create-app.js';
import { runMigrations, seedAdminUser, seedStaticRoles, truncateAll } from './helpers/db.js';
import { flushOutbox } from './helpers/outbox.js';
import { createBuckets } from './helpers/s3.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';
import { KafkaConsumerService } from '@/infra/lib/nest-kafka/consumer/kafka-consumer.service.js';

const FIXED_OTP = '123456';

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
    await app.get(KafkaConsumerService).waitForPartitions();

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

  // ─── GET /admin/users ──────────────────────────────────────────────

  describe('GET /admin/users', () => {
    it('should return 401 without auth token', async () => {
      await e2e.agent.get('/admin/users').expect(401);
    });

    it('should return 403 for user without USER.MANAGE permission', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);

      await e2e.agent.get('/admin/users').set('Authorization', `Bearer ${accessToken}`).expect(403);
    });

    it('should return empty results for admin', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      const res = await e2e.agent
        .get('/admin/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('users');
      expect(res.body).toHaveProperty('total');
      expect(res.body.users).toBeInstanceOf(Array);
    });

    it('should find a registered user by name after projection', async () => {
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      // Register a user — this triggers outbox → Kafka → MeiliSearch projection
      await registerUser(e2e.agent, FIXED_OTP, {
        phone: '+79990000003',
        fullName: 'Searchable User',
      });
      await flushOutbox(e2e.app);

      // Wait for the projection to complete (async: Kafka consumer → MeiliSearch)
      await vi.waitFor(
        async () => {
          const res = await e2e.agent
            .get('/admin/users')
            .query({ query: 'Searchable' })
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

          expect(res.body.total).toBeGreaterThan(0);
        },
        { timeout: 10_000, interval: 500 },
      );

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
      const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);

      // Register multiple users
      await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000004', fullName: 'User Alpha' });
      await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000005', fullName: 'User Beta' });
      await flushOutbox(e2e.app);

      // Wait for projections (Kafka consumer → MeiliSearch)
      await vi.waitFor(
        async () => {
          const res = await e2e.agent
            .get('/admin/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

          expect(res.body.total).toBeGreaterThanOrEqual(2);
        },
        { timeout: 10_000, interval: 500 },
      );

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

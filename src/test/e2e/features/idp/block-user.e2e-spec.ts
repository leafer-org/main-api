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
import { KafkaConsumerService } from '@/infra/lib/nest-kafka/consumer/kafka-consumer.service.js';

const FIXED_OTP = '123456';

describe('idp-block-user', () => {
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

  describe('Block user', () => {
  it('Блокирует пользователя и запрещает логин', async () => {
    const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
    const { userId } = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000010',
      fullName: 'Block Target',
    });

    // Block the user
    await e2e.agent
      .post(`/admin/users/${userId}/block`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Violation of terms' })
      .expect(200);

    // Blocked user should not be able to login
    await e2e.agent.post('/auth/request-otp').send({ phoneNumber: '+79990000010' }).expect(200);

    const verifyRes = await e2e.agent
      .post('/auth/verify-otp')
      .send({ phoneNumber: '+79990000010', code: FIXED_OTP })
      .expect(403);

    expect(verifyRes.body.type).toBe('user_blocked');
    expect(verifyRes.body.data.reason).toBe('Violation of terms');
  });

  it('Разблокирует пользователя и разрешает логин', async () => {
    const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
    const { userId } = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000011',
      fullName: 'Unblock Target',
    });

    // Block
    await e2e.agent
      .post(`/admin/users/${userId}/block`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Temporary block' })
      .expect(200);

    // Unblock
    await e2e.agent
      .post(`/admin/users/${userId}/unblock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // User should be able to login again
    await e2e.agent.post('/auth/request-otp').send({ phoneNumber: '+79990000011' }).expect(200);

    const verifyRes = await e2e.agent
      .post('/auth/verify-otp')
      .send({ phoneNumber: '+79990000011', code: FIXED_OTP })
      .expect(200);

    expect(verifyRes.body.type).toBe('authenticated');
  });

  it('Повторная блокировка заблокированного — 400', async () => {
    const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
    const { userId } = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000012',
      fullName: 'Double Block',
    });

    await e2e.agent
      .post(`/admin/users/${userId}/block`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'First block' })
      .expect(200);

    const res = await e2e.agent
      .post(`/admin/users/${userId}/block`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Second block' })
      .expect(400);

    expect(res.body.type).toBe('user_already_blocked');
  });

  it('Разблокировка незаблокированного — 400', async () => {
    const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
    const { userId } = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000013',
      fullName: 'Not Blocked',
    });

    const res = await e2e.agent
      .post(`/admin/users/${userId}/unblock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    expect(res.body.type).toBe('user_not_blocked');
  });

  it('Не админу — 403', async () => {
    const { accessToken, userId } = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000014',
      fullName: 'Regular User',
    });

    await e2e.agent
      .post(`/admin/users/${userId}/block`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'Self block' })
      .expect(403);
  });

  it('Блокировка инвалидирует активные сессии', async () => {
    const { accessToken: adminToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
    const { accessToken: userToken, userId } = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000015',
      fullName: 'Session Test',
    });

    // User can access /me before block
    await e2e.agent.get('/me').set('Authorization', `Bearer ${userToken}`).expect(200);

    // Block the user
    await e2e.agent
      .post(`/admin/users/${userId}/block`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Session invalidation test' })
      .expect(200);

    // User's token should now be invalid (session deleted)
    await e2e.agent.get('/me').set('Authorization', `Bearer ${userToken}`).expect(401);
  });
  });
});

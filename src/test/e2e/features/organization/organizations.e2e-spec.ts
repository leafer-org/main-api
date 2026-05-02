import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { registerUser } from '../../actors/auth.js';
import { createOrganization } from '../../actors/organization.js';
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

describe('organization-organizations', () => {
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

  // ─── POST /organizations ─────────────────────────────────────────

  describe('POST /organizations', () => {
    it('создаёт организацию с дефолтной free-подпиской', async () => {
      const { accessToken, userId } = await registerUser(e2e.agent, FIXED_OTP);

      const org = await createOrganization(e2e.agent, accessToken, {
        name: 'My Org',
        description: 'My description',
      });

      expect(org.id).toBeDefined();
      expect(org.infoDraft).toMatchObject({
        name: 'My Org',
        description: 'My description',
        avatarId: null,
        status: 'draft',
      });
      expect(org.infoPublication).toBeNull();
      expect(org.subscription).toMatchObject({
        planId: 'free',
        maxEmployees: 1,
        maxPublishedItems: 3,
      });
      expect(org.employees).toHaveLength(1);
      expect(org.employees[0]).toMatchObject({
        userId,
        isOwner: true,
      });
      expect(org.roles).toHaveLength(1);
      expect(org.roles[0].name).toBe('ADMIN');
    });

    it('возвращает 401 без авторизации', async () => {
      await e2e.agent.post('/organizations').send({ name: 'Org', description: 'desc' }).expect(401);
    });
  });

  // ─── GET /organizations/:id ───────────────────────────────────────

  describe('GET /organizations/:id', () => {
    it('возвращает карточку организации владельцу', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);
      const org = await createOrganization(e2e.agent, accessToken);

      const res = await e2e.agent
        .get(`/organizations/${org.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.id).toBe(org.id);
      expect(res.body.infoDraft.name).toBe('Test Organization');
    });

    it('возвращает ошибку для не-сотрудника', async () => {
      const owner = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000010' });
      const org = await createOrganization(e2e.agent, owner.accessToken);

      const other = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000011' });

      await e2e.agent
        .get(`/organizations/${org.id}`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(403);
    });
  });

  // ─── PATCH /organizations/:id ─────────────────────────────────────

  describe('PATCH /organizations/:id', () => {
    it('обновляет infoDraft', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);
      const org = await createOrganization(e2e.agent, accessToken);

      const res = await e2e.agent
        .patch(`/organizations/${org.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Updated Name',
          description: 'Updated Description',
          avatarId: null,
        })
        .expect(200);

      expect(res.body.infoDraft).toMatchObject({
        name: 'Updated Name',
        description: 'Updated Description',
        status: 'draft',
      });
    });

    it('возвращает 403 для не-сотрудника', async () => {
      const owner = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000010' });
      const org = await createOrganization(e2e.agent, owner.accessToken);

      const other = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000011' });

      await e2e.agent
        .patch(`/organizations/${org.id}`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .send({ name: 'Hack', description: 'Hack', avatarId: null })
        .expect(403);
    });
  });

  // ─── POST /organizations/:id/submit-for-moderation ────────────────

  describe('POST /organizations/:id/submit-for-moderation', () => {
    it('отправляет info на модерацию', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);
      const org = await createOrganization(e2e.agent, accessToken);

      await e2e.agent
        .post(`/organizations/${org.id}/submit-for-moderation`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      await flushOutbox(e2e.app);

      // Verify status changed to moderation-request
      const res = await e2e.agent
        .get(`/organizations/${org.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.infoDraft.status).toBe('moderation-request');
    });

    it('возвращает 403 для не-сотрудника', async () => {
      const owner = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000010' });
      const org = await createOrganization(e2e.agent, owner.accessToken);

      const other = await registerUser(e2e.agent, FIXED_OTP, { phone: '+79990000011' });

      await e2e.agent
        .post(`/organizations/${org.id}/submit-for-moderation`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(403);
    });
  });
});

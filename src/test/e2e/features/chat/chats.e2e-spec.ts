import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { registerUser } from '../../actors/auth.js';
import { createOrganization } from '../../actors/organization.js';
import { startContainers, stopContainers } from '../../helpers/containers.js';
import { type E2eApp } from '../../helpers/create-app.js';
import { runMigrations, seedAdminUser, seedStaticRoles, truncateAll } from '../../helpers/db.js';
import { createBuckets } from '../../helpers/s3.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';

const FIXED_OTP = '123456';

describe('chat — open with organization', () => {
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

  async function setupOwnerAndOrg() {
    const owner = await registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000010',
      fullName: 'Org Owner',
    });
    const org = await createOrganization(e2e.agent, owner.accessToken, {
      name: 'Test Org',
    });
    return { owner, org };
  }

  async function setupClient() {
    return registerUser(e2e.agent, FIXED_OTP, {
      phone: '+79990000020',
      fullName: 'Client User',
    });
  }

  // ─── POST /chats ────────────────────────────────────────────────────

  describe('Открытие нового чата', () => {
    it('создаёт чат user→organization при первом обращении', async () => {
      const { org } = await setupOwnerAndOrg();
      const client = await setupClient();

      const res = await e2e.agent
        .post('/chats')
        .set('Authorization', `Bearer ${client.accessToken}`)
        .send({
          organizationId: org.id,
          message: { text: 'Здравствуйте, есть вопрос', mediaIds: [] },
        })
        .expect(200);

      expect(res.body.chatId).toBeDefined();
      expect(res.body.reused).toBe(false);
    });

    it('повторный POST /chats возвращает существующий чат (reused=true)', async () => {
      const { org } = await setupOwnerAndOrg();
      const client = await setupClient();

      const first = await e2e.agent
        .post('/chats')
        .set('Authorization', `Bearer ${client.accessToken}`)
        .send({ organizationId: org.id, message: { text: 'Первое', mediaIds: [] } })
        .expect(200);

      const second = await e2e.agent
        .post('/chats')
        .set('Authorization', `Bearer ${client.accessToken}`)
        .send({ organizationId: org.id, message: { text: 'Второе', mediaIds: [] } })
        .expect(200);

      expect(second.body.chatId).toBe(first.body.chatId);
      expect(second.body.reused).toBe(true);
    });

    it('400 empty_message при пустом text и пустых mediaIds', async () => {
      const { org } = await setupOwnerAndOrg();
      const client = await setupClient();

      const res = await e2e.agent
        .post('/chats')
        .set('Authorization', `Bearer ${client.accessToken}`)
        .send({ organizationId: org.id, message: { text: null, mediaIds: [] } })
        .expect(400);

      expect(res.body.type).toBe('empty_message');
    });

    it('404 organization_not_found при несуществующей орг', async () => {
      const client = await setupClient();

      const res = await e2e.agent
        .post('/chats')
        .set('Authorization', `Bearer ${client.accessToken}`)
        .send({
          organizationId: '00000000-0000-0000-0000-000000000000',
          message: { text: 'hi', mediaIds: [] },
        })
        .expect(404);

      expect(res.body.type).toBe('organization_not_found');
    });

    it('401 без авторизации', async () => {
      const { org } = await setupOwnerAndOrg();

      await e2e.agent
        .post('/chats')
        .send({
          organizationId: org.id,
          message: { text: 'hi', mediaIds: [] },
        })
        .expect(401);
    });
  });
});

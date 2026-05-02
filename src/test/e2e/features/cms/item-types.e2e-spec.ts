import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loginAsAdmin, registerUser } from '../../actors/auth.js';
import { startContainers, stopContainers } from '../../helpers/containers.js';
import { type E2eApp } from '../../helpers/create-app.js';
import { runMigrations, seedAdminUser, seedStaticRoles, truncateAll } from '../../helpers/db.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';
import type { WidgetSettings } from '@/kernel/domain/vo/widget-settings.js';

const FIXED_OTP = '123456';

describe('CMS Item Types', () => {
  let e2e: E2eApp;
  let adminToken: string;

  beforeAll(async () => {
    await startContainers();
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await runMigrations(process.env.DB_URL);

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

  // --- Helpers ---

  const defaultSettings: WidgetSettings[] = [
    { type: 'base-info', required: true },
    { type: 'location', required: false },
    { type: 'payment', required: false, allowedStrategies: ['free', 'one-time', 'subscription'] },
  ];

  function createItemType(
    overrides: Partial<{
      id: string;
      name: string;
      label: string;
      widgetSettings: WidgetSettings[];
    }> = {},
  ) {
    return e2e.agent
      .post('/cms/item-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        id: overrides.id ?? randomUUID(),
        name: overrides.name ?? 'Test Type',
        label: overrides.label ?? 'тестовый тип',
        widgetSettings: overrides.widgetSettings ?? defaultSettings,
      });
  }

  // --- CRUD ---

  describe('CRUD', () => {
    it('создаёт item type', async () => {
      const id = randomUUID();
      const res = await createItemType({ id, name: 'Service' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id,
        name: 'Service',
        widgetSettings: defaultSettings,
      });
    });

    it('возвращает список item types', async () => {
      await createItemType({ name: 'Type A' }).expect(201);
      await createItemType({ name: 'Type B' }).expect(201);

      const res = await e2e.agent
        .get('/cms/item-types')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveLength(2);
    });

    it('обновляет item type', async () => {
      const id = randomUUID();
      await createItemType({ id, name: 'Original' }).expect(201);

      const res = await e2e.agent
        .patch(`/cms/item-types/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated',
          label: 'обновлённый',
          widgetSettings: defaultSettings,
        })
        .expect(200);

      expect(res.body.name).toBe('Updated');
    });
  });

  // --- Validation ---

  describe('Validation', () => {
    it('отклоняет дублирующиеся типы виджетов в settings', async () => {
      const res = await createItemType({
        widgetSettings: [
          { type: 'base-info', required: true },
          { type: 'base-info', required: false },
        ],
      });

      expect(res.status).toBe(400);
    });
  });

  // --- Permissions ---

  describe('Permissions', () => {
    it('Без авторизации — 401', async () => {
      await e2e.agent.get('/cms/item-types').expect(401);
    });

    it('Пользователь без manageCms — 403', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);

      await e2e.agent
        .get('/cms/item-types')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });
  });
});

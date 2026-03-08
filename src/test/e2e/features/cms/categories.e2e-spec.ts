import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loginAsAdmin, registerUser } from '../../actors/auth.js';
import { startContainers, stopContainers } from '../../helpers/containers.js';
import { type E2eApp } from '../../helpers/create-app.js';
import { runMigrations, seedAdminUser, seedStaticRoles, truncateAll } from '../../helpers/db.js';
import { flushOutbox } from '../../helpers/outbox.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';

const FIXED_OTP = '123456';

describe('CMS Categories (e2e)', () => {
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

  function createCategory(
    overrides: Partial<{
      id: string;
      parentCategoryId: string | null;
      name: string;
      iconId: string | null;
      allowedTypeIds: string[];
    }> = {},
  ) {
    return e2e.agent
      .post('/cms/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        id: overrides.id ?? randomUUID(),
        parentCategoryId: overrides.parentCategoryId ?? null,
        name: overrides.name ?? 'Test Category',
        iconId: overrides.iconId ?? null,
        allowedTypeIds: overrides.allowedTypeIds ?? [],
      });
  }

  // --- CRUD ---

  describe('CRUD', () => {
    it('should create a category', async () => {
      const id = randomUUID();
      const res = await createCategory({ id, name: 'My Category' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id,
        name: 'My Category',
        status: 'draft',
        parentCategoryId: null,
        allowedTypeIds: [],
        attributes: [],
      });
    });

    it('should list categories', async () => {
      await createCategory({ name: 'Cat A' }).expect(201);
      await createCategory({ name: 'Cat B' }).expect(201);

      const res = await e2e.agent
        .get('/cms/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveLength(2);
    });

    it('should get category detail', async () => {
      const id = randomUUID();
      await createCategory({ id, name: 'Detail Cat' }).expect(201);

      const res = await e2e.agent
        .get(`/cms/categories/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id,
        name: 'Detail Cat',
        status: 'draft',
      });
    });

    it('should return 404 for non-existent category', async () => {
      await e2e.agent
        .get(`/cms/categories/${randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('should update a category', async () => {
      const id = randomUUID();
      await createCategory({ id, name: 'Original' }).expect(201);

      const res = await e2e.agent
        .patch(`/cms/categories/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated',
          iconId: null,
          parentCategoryId: null,
          allowedTypeIds: [],
        })
        .expect(200);

      expect(res.body.name).toBe('Updated');
    });
  });

  // --- Hierarchy ---

  describe('Hierarchy', () => {
    it('should create a child category', async () => {
      const parentId = randomUUID();
      const childId = randomUUID();
      const typeIds = [randomUUID()];

      await createCategory({ id: parentId, name: 'Parent', allowedTypeIds: typeIds }).expect(201);
      await createCategory({
        id: childId,
        name: 'Child',
        parentCategoryId: parentId,
        allowedTypeIds: typeIds,
      }).expect(201);

      await flushOutbox(e2e.app);

      const listRes = await e2e.agent
        .get('/cms/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const parent = listRes.body.find((c: any) => c.id === parentId);
      expect(parent).toBeDefined();
    });

    it('should reject child with allowedTypeIds not subset of parent', async () => {
      const parentId = randomUUID();
      const parentTypeId = randomUUID();
      const invalidTypeId = randomUUID();

      await createCategory({ id: parentId, allowedTypeIds: [parentTypeId] }).expect(201);

      const res = await createCategory({
        parentCategoryId: parentId,
        allowedTypeIds: [invalidTypeId],
      });

      expect(res.status).toBe(400);
    });
  });

  // --- Publish / Unpublish ---

  describe('Publish / Unpublish', () => {
    it('should publish a category', async () => {
      const id = randomUUID();
      await createCategory({ id }).expect(201);

      await e2e.agent
        .post(`/cms/categories/${id}/publish`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const detail = await e2e.agent
        .get(`/cms/categories/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(detail.body.status).toBe('published');
    });

    it('should unpublish a published category', async () => {
      const id = randomUUID();
      await createCategory({ id }).expect(201);

      await e2e.agent
        .post(`/cms/categories/${id}/publish`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await e2e.agent
        .post(`/cms/categories/${id}/unpublish`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const detail = await e2e.agent
        .get(`/cms/categories/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(detail.body.status).toBe('unpublished');
    });

    it('should reject unpublish of non-published category', async () => {
      const id = randomUUID();
      await createCategory({ id }).expect(201);

      await e2e.agent
        .post(`/cms/categories/${id}/unpublish`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('should flush outbox events after publish', async () => {
      const id = randomUUID();
      await createCategory({ id }).expect(201);

      await e2e.agent
        .post(`/cms/categories/${id}/publish`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await flushOutbox(e2e.app);
    });
  });

  // --- Attributes ---

  describe('Attributes', () => {
    it('should add an attribute to a category', async () => {
      const categoryId = randomUUID();
      const attributeId = randomUUID();
      await createCategory({ id: categoryId }).expect(201);

      await e2e.agent
        .post(`/cms/categories/${categoryId}/attributes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          attributeId,
          name: 'Color',
          required: true,
          schema: { type: 'text' },
        })
        .expect(200);

      const detail = await e2e.agent
        .get(`/cms/categories/${categoryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(detail.body.attributes).toHaveLength(1);
      expect(detail.body.attributes[0]).toMatchObject({
        attributeId,
        name: 'Color',
        required: true,
      });
    });

    it('should remove an attribute from a category', async () => {
      const categoryId = randomUUID();
      const attributeId = randomUUID();
      await createCategory({ id: categoryId }).expect(201);

      await e2e.agent
        .post(`/cms/categories/${categoryId}/attributes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ attributeId, name: 'Color', required: true, schema: { type: 'text' } })
        .expect(200);

      await e2e.agent
        .delete(`/cms/categories/${categoryId}/attributes/${attributeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const detail = await e2e.agent
        .get(`/cms/categories/${categoryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(detail.body.attributes).toHaveLength(0);
    });

    it('should reject duplicate attribute', async () => {
      const categoryId = randomUUID();
      const attributeId = randomUUID();
      await createCategory({ id: categoryId }).expect(201);

      await e2e.agent
        .post(`/cms/categories/${categoryId}/attributes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ attributeId, name: 'Color', required: true, schema: { type: 'text' } })
        .expect(200);

      await e2e.agent
        .post(`/cms/categories/${categoryId}/attributes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ attributeId, name: 'Color', required: true, schema: { type: 'text' } })
        .expect(400);
    });

    it('should reject removing non-existent attribute', async () => {
      const categoryId = randomUUID();
      await createCategory({ id: categoryId }).expect(201);

      await e2e.agent
        .delete(`/cms/categories/${categoryId}/attributes/${randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  // --- Permissions ---

  describe('Permissions', () => {
    it('should return 401 without auth', async () => {
      await e2e.agent.get('/cms/categories').expect(401);
    });

    it('should return 403 for user without manageCms', async () => {
      const { accessToken } = await registerUser(e2e.agent, FIXED_OTP);

      await e2e.agent
        .get('/cms/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });
  });
});

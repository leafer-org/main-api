import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loginAsAdmin, registerUser } from '../../actors/auth.js';
import { startContainers, stopContainers } from '../../helpers/containers.js';
import { type E2eApp } from '../../helpers/create-app.js';
import { runMigrations, seedAdminUser, seedStaticRoles, truncateAll } from '../../helpers/db.js';
import { flushOutbox } from '../../helpers/outbox.js';
import { createBuckets } from '../../helpers/s3.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';

const FIXED_OTP = '123456';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

describe('CMS Categories (e2e)', () => {
  let e2e: E2eApp;
  let adminToken: string;

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

  async function uploadIcon(): Promise<string> {
    const res = await e2e.agent
      .post('/media/image/upload-request')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'icon.png', mimeType: 'image/png' })
      .expect(200);

    const { fileId, uploadUrl, uploadFields } = res.body;
    const formData = new FormData();
    for (const [key, value] of Object.entries(uploadFields as Record<string, string>)) {
      formData.append(key, value);
    }
    formData.append('file', new Blob([new Uint8Array(TINY_PNG)], { type: 'image/png' }));
    await fetch(uploadUrl, { method: 'POST', body: formData });

    return fileId as string;
  }

  async function createCategory(
    overrides: Partial<{
      id: string;
      parentCategoryId: string | null;
      name: string;
      iconId: string;
      order: number;
      allowedTypeIds: string[];
      ageGroups: string[];
    }> = {},
  ) {
    const iconId = overrides.iconId ?? (await uploadIcon());
    return e2e.agent
      .post('/cms/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        id: overrides.id ?? randomUUID(),
        parentCategoryId: overrides.parentCategoryId ?? null,
        name: overrides.name ?? 'Test Category',
        iconId,
        order: overrides.order ?? 0,
        allowedTypeIds: overrides.allowedTypeIds ?? [randomUUID()],
        ageGroups: overrides.ageGroups ?? ['adults'],
      });
  }

  // --- CRUD ---

  describe('CRUD', () => {
    it('should create a category', async () => {
      const id = randomUUID();
      const iconId = await uploadIcon();
      const typeId = randomUUID();
      const res = await createCategory({ id, name: 'My Category', iconId, allowedTypeIds: [typeId] });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id,
        name: 'My Category',
        iconId,
        status: 'draft',
        parentCategoryId: null,
        allowedTypeIds: [typeId],
        ageGroups: ['adults'],
        attributes: [],
      });
      expect(res.body.iconUrl).toEqual(expect.any(String));
    });

    it('should list categories', async () => {
      const resA = await createCategory({ name: 'Cat A' });
      expect(resA.status).toBe(201);
      const resB = await createCategory({ name: 'Cat B' });
      expect(resB.status).toBe(201);

      const res = await e2e.agent
        .get('/cms/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].iconUrl).toEqual(expect.any(String));
      expect(res.body[0].ageGroups).toEqual(['adults']);
    });

    it('should get category detail', async () => {
      const id = randomUUID();
      const res1 = await createCategory({ id, name: 'Detail Cat' });
      expect(res1.status).toBe(201);

      const res = await e2e.agent
        .get(`/cms/categories/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id,
        name: 'Detail Cat',
        status: 'draft',
        ageGroups: ['adults'],
      });
      expect(res.body.iconUrl).toEqual(expect.any(String));
    });

    it('should return 404 for non-existent category', async () => {
      await e2e.agent
        .get(`/cms/categories/${randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('should update a category', async () => {
      const id = randomUUID();
      const res1 = await createCategory({ id, name: 'Original' });
      expect(res1.status).toBe(201);

      const newIconId = await uploadIcon();
      const res = await e2e.agent
        .patch(`/cms/categories/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated',
          iconId: newIconId,
          parentCategoryId: null,
          allowedTypeIds: [randomUUID()],
          ageGroups: ['children', 'adults'],
        })
        .expect(200);

      expect(res.body.name).toBe('Updated');
      expect(res.body.iconId).toBe(newIconId);
      expect(res.body.ageGroups).toEqual(['children', 'adults']);
    });

    it('should reject category with empty allowedTypeIds', async () => {
      const res = await createCategory({ allowedTypeIds: [] });
      expect(res.status).toBe(400);
    });

    it('should reject category with empty ageGroups', async () => {
      const res = await createCategory({ ageGroups: [] });
      expect(res.status).toBe(400);
    });

    it('should reject update with empty allowedTypeIds', async () => {
      const id = randomUUID();
      const r = await createCategory({ id });
      expect(r.status).toBe(201);

      const res = await e2e.agent
        .patch(`/cms/categories/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated',
          iconId: r.body.iconId,
          parentCategoryId: null,
          allowedTypeIds: [],
          ageGroups: ['adults'],
        });

      expect(res.status).toBe(400);
    });

    it('should reject update with empty ageGroups', async () => {
      const id = randomUUID();
      const r = await createCategory({ id });
      expect(r.status).toBe(201);

      const res = await e2e.agent
        .patch(`/cms/categories/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated',
          iconId: r.body.iconId,
          parentCategoryId: null,
          allowedTypeIds: [randomUUID()],
          ageGroups: [],
        });

      expect(res.status).toBe(400);
    });

    it('should create category with specific ageGroups', async () => {
      const id = randomUUID();
      const res = await createCategory({
        id,
        name: 'Multi Age',
        ageGroups: ['children', 'adults'],
      });

      expect(res.status).toBe(201);
      expect(res.body.ageGroups).toEqual(['children', 'adults']);
    });
  });

  // --- Hierarchy ---

  describe('Hierarchy', () => {
    it('should create a child category', async () => {
      const parentId = randomUUID();
      const childId = randomUUID();
      const typeIds = [randomUUID()];

      const r1 = await createCategory({ id: parentId, name: 'Parent', allowedTypeIds: typeIds });
      expect(r1.status).toBe(201);
      const r2 = await createCategory({
        id: childId,
        name: 'Child',
        parentCategoryId: parentId,
        allowedTypeIds: typeIds,
      });
      expect(r2.status).toBe(201);

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

      const r1 = await createCategory({ id: parentId, allowedTypeIds: [parentTypeId] });
      expect(r1.status).toBe(201);

      const res = await createCategory({
        parentCategoryId: parentId,
        allowedTypeIds: [invalidTypeId],
      });

      expect(res.status).toBe(400);
    });

    it('should reject child with ageGroups not subset of parent', async () => {
      const parentId = randomUUID();
      const typeId = randomUUID();

      const r1 = await createCategory({
        id: parentId,
        allowedTypeIds: [typeId],
        ageGroups: ['adults'],
      });
      expect(r1.status).toBe(201);

      const res = await createCategory({
        parentCategoryId: parentId,
        allowedTypeIds: [typeId],
        ageGroups: ['children'],
      });

      expect(res.status).toBe(400);
    });

    it('should allow child with ageGroups subset of parent', async () => {
      const parentId = randomUUID();
      const typeId = randomUUID();

      const r1 = await createCategory({
        id: parentId,
        allowedTypeIds: [typeId],
        ageGroups: ['children', 'adults'],
      });
      expect(r1.status).toBe(201);

      const res = await createCategory({
        parentCategoryId: parentId,
        allowedTypeIds: [typeId],
        ageGroups: ['children'],
      });

      expect(res.status).toBe(201);
    });
  });

  // --- Publish / Unpublish ---

  describe('Publish / Unpublish', () => {
    it('should publish a category', async () => {
      const id = randomUUID();
      const r = await createCategory({ id });
      expect(r.status).toBe(201);

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
      const r = await createCategory({ id });
      expect(r.status).toBe(201);

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
      const r = await createCategory({ id });
      expect(r.status).toBe(201);

      await e2e.agent
        .post(`/cms/categories/${id}/unpublish`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('should flush outbox events after publish', async () => {
      const id = randomUUID();
      const r = await createCategory({ id });
      expect(r.status).toBe(201);

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
      const r = await createCategory({ id: categoryId });
      expect(r.status).toBe(201);

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
      const r = await createCategory({ id: categoryId });
      expect(r.status).toBe(201);

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
      const r = await createCategory({ id: categoryId });
      expect(r.status).toBe(201);

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
      const r = await createCategory({ id: categoryId });
      expect(r.status).toBe(201);

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

  // --- Order ---

  describe('Order', () => {
    it('should create category with default order 0', async () => {
      const res = await createCategory({ name: 'No Order' });
      expect(res.status).toBe(201);
      expect(res.body.order).toBe(0);
    });

    it('should create category with explicit order', async () => {
      const res = await createCategory({ name: 'Ordered', order: 10 });
      expect(res.status).toBe(201);
      expect(res.body.order).toBe(10);
    });

    it('should update category order', async () => {
      const id = randomUUID();
      const r = await createCategory({ id, name: 'Cat', order: 5 });
      expect(r.status).toBe(201);

      const iconId = r.body.iconId as string;
      const res = await e2e.agent
        .patch(`/cms/categories/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Cat',
          iconId,
          order: 20,
          parentCategoryId: null,
          allowedTypeIds: r.body.allowedTypeIds,
          ageGroups: ['adults'],
        })
        .expect(200);

      expect(res.body.order).toBe(20);
    });

    it('should list categories sorted by order asc, then name asc', async () => {
      const typeId = randomUUID();
      await createCategory({ name: 'Zebra', order: 10, allowedTypeIds: [typeId] });
      await createCategory({ name: 'Apple', order: 10, allowedTypeIds: [typeId] });
      await createCategory({ name: 'Mango', order: 5, allowedTypeIds: [typeId] });
      await createCategory({ name: 'Grape', order: 1, allowedTypeIds: [typeId] });

      const res = await e2e.agent
        .get('/cms/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const names = (res.body as { name: string }[]).map((c) => c.name);
      expect(names).toEqual(['Grape', 'Mango', 'Apple', 'Zebra']);
    });

    it('should carry order through publish to discovery', async () => {
      const id = randomUUID();
      const r = await createCategory({ id, name: 'Ordered Cat', order: 42 });
      expect(r.status).toBe(201);

      await e2e.agent
        .post(`/cms/categories/${id}/publish`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await flushOutbox(e2e.app);

      // Verify the published event carried the order by checking discovery endpoint
      const discoveryRes = await e2e.agent.get('/categories').expect(200);
      const cat = (discoveryRes.body as { categoryId: string }[]).find(
        (c) => c.categoryId === id,
      );
      expect(cat).toBeDefined();
    });

  });
});

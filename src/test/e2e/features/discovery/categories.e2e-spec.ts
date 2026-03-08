import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { uuidv7 } from 'uuidv7';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { startContainers, stopContainers } from '../../helpers/containers.js';
import { runMigrations, seedAdminUser, seedStaticRoles, truncateAll } from '../../helpers/db.js';
import { waitForAllConsumers } from '../../helpers/kafka.js';
import { createBuckets } from '../../helpers/s3.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { DiscoveryDatabaseClient } from '@/features/discovery/adapters/db/client.js';
import {
  discoveryCategories,
  discoveryItems,
  discoveryItemTypes,
} from '@/features/discovery/adapters/db/schema.js';
import { CategoryProjectionPort } from '@/features/discovery/application/projection-ports.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';
import { categoryStreamingContract } from '@/infra/kafka-contracts/category.contract.js';
import { itemStreamingContract } from '@/infra/kafka-contracts/item.contract.js';
import { itemTypeStreamingContract } from '@/infra/kafka-contracts/item-type.contract.js';
import type { Contract, ContractMessage } from '@/infra/lib/nest-kafka/contract/contract.js';
import { KafkaProducerService } from '@/infra/lib/nest-kafka/producer/kafka-producer.service.js';

const FIXED_OTP = '123456';
const WAIT_OPTIONS = { timeout: 15_000, interval: 500 };

function expectDefined<T>(value: T | undefined): asserts value is T {
  expect(value).toBeDefined();
}

function sleep(t = 100) {
  return new Promise((res) => setTimeout(() => res(undefined), t));
}

describe('Discovery Categories HTTP (e2e)', () => {
  let app: INestApplication;
  let agent: ReturnType<typeof request>;
  let producer: KafkaProducerService;
  let db: DiscoveryDatabaseClient;
  let categoryProjection: CategoryProjectionPort;

  async function produce<C extends Contract>(contract: C, message: ContractMessage<C>) {
    producer.send(contract, message);
    await producer.flush();
  }

  async function seedCategory(params: {
    categoryId: string;
    parentCategoryId: string | null;
    name: string;
    iconId?: string | null;
    allowedTypeIds?: string[];
    ancestorIds?: string[];
    attributes?: { attributeId: string; name: string; required: boolean; schema: object }[];
  }) {
    await produce(categoryStreamingContract, {
      id: uuidv7(),
      type: 'category.published',
      categoryId: params.categoryId,
      parentCategoryId: params.parentCategoryId,
      name: params.name,
      iconId: params.iconId ?? null,
      allowedTypeIds: params.allowedTypeIds ?? [],
      ancestorIds: params.ancestorIds ?? [],
      attributes: params.attributes ?? [],
      republished: false,
      publishedAt: new Date().toISOString(),
    });

    await vi.waitFor(async () => {
      const [row] = await db
        .select()
        .from(discoveryCategories)
        .where(eq(discoveryCategories.id, params.categoryId));
      expectDefined(row);
    }, WAIT_OPTIONS);
  }

  async function seedItemType(typeId: string, name: string) {
    await produce(itemTypeStreamingContract, {
      id: uuidv7(),
      type: 'item-type.created',
      typeId,
      name,
      availableWidgetTypes: ['base-info'],
      requiredWidgetTypes: ['base-info'],
      createdAt: new Date().toISOString(),
    });

    await vi.waitFor(async () => {
      const [row] = await db
        .select()
        .from(discoveryItemTypes)
        .where(eq(discoveryItemTypes.id, typeId));
      expectDefined(row);
    }, WAIT_OPTIONS);
  }

  async function seedItem(itemId: string, typeId: string, orgId: string, categoryIds: string[]) {
    await produce(itemStreamingContract, {
      id: uuidv7(),
      type: 'item.published',
      itemId,
      typeId,
      organizationId: orgId,
      widgets: [
        { type: 'base-info', title: 'Test Item', description: 'Desc', imageId: null },
        { type: 'owner', organizationId: orgId, name: 'Org', avatarId: null },
        { type: 'category', categoryIds, attributes: [] },
      ],
      republished: false,
      publishedAt: new Date().toISOString(),
    });

    await vi.waitFor(async () => {
      const [row] = await db.select().from(discoveryItems).where(eq(discoveryItems.id, itemId));
      expectDefined(row);
    }, WAIT_OPTIONS);
  }

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

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    await waitForAllConsumers(app);
    await sleep(100);

    producer = app.get(KafkaProducerService);
    db = app.get(DiscoveryDatabaseClient);
    categoryProjection = app.get(CategoryProjectionPort);
    agent = request(app.getHttpServer());
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
    await app?.close();
    await stopContainers();
  });

  // ─── GET /categories ─────────────────────────────────────────────

  describe('GET /categories', () => {
    it('should return empty array when no categories exist', async () => {
      const res = await agent.get('/categories').expect(200);
      expect(res.body).toEqual([]);
    });

    it('should return root categories', async () => {
      const rootId1 = randomUUID();
      const rootId2 = randomUUID();
      const childId = randomUUID();

      await seedCategory({ categoryId: rootId1, parentCategoryId: null, name: 'Root 1' });
      await seedCategory({ categoryId: rootId2, parentCategoryId: null, name: 'Root 2' });
      await seedCategory({ categoryId: childId, parentCategoryId: rootId1, name: 'Child' });

      const res = await agent.get('/categories').expect(200);

      expect(res.body).toHaveLength(2);
      const names = res.body.map((c: { name: string }) => c.name).sort();
      expect(names).toEqual(['Root 1', 'Root 2']);
    });

    it('should return children by parentCategoryId', async () => {
      const rootId = randomUUID();
      const childId1 = randomUUID();
      const childId2 = randomUUID();

      await seedCategory({ categoryId: rootId, parentCategoryId: null, name: 'Root' });
      await seedCategory({ categoryId: childId1, parentCategoryId: rootId, name: 'Child 1' });
      await seedCategory({ categoryId: childId2, parentCategoryId: rootId, name: 'Child 2' });

      const res = await agent.get('/categories').query({ parentCategoryId: rootId }).expect(200);

      expect(res.body).toHaveLength(2);
      const names = res.body.map((c: { name: string }) => c.name).sort();
      expect(names).toEqual(['Child 1', 'Child 2']);
    });

    it('should return correct childCount after recalc', async () => {
      const rootId = randomUUID();
      const childId1 = randomUUID();
      const childId2 = randomUUID();

      await seedCategory({ categoryId: rootId, parentCategoryId: null, name: 'Root' });
      await seedCategory({ categoryId: childId1, parentCategoryId: rootId, name: 'Child 1' });
      await seedCategory({ categoryId: childId2, parentCategoryId: rootId, name: 'Child 2' });

      await categoryProjection.recalcAllCounts();

      const res = await agent.get('/categories').expect(200);

      const root = res.body.find((c: { categoryId: string }) => c.categoryId === rootId);
      expectDefined(root);
      expect(root.childCount).toBe(2);
    });

    it('should return correct direct itemCount after recalc', async () => {
      const rootId = randomUUID();
      const typeId = randomUUID();
      const orgId = randomUUID();

      await seedCategory({ categoryId: rootId, parentCategoryId: null, name: 'Root' });
      await seedItem(randomUUID(), typeId, orgId, [rootId]);
      await seedItem(randomUUID(), typeId, orgId, [rootId]);

      await categoryProjection.recalcAllCounts();

      const res = await agent.get('/categories').expect(200);

      const root = res.body.find((c: { categoryId: string }) => c.categoryId === rootId);
      expectDefined(root);
      expect(root.itemCount).toBe(2);
    });

    it('should accumulate itemCount from children to parent', async () => {
      const rootId = randomUUID();
      const childId = randomUUID();
      const typeId = randomUUID();
      const orgId = randomUUID();

      await seedCategory({ categoryId: rootId, parentCategoryId: null, name: 'Root' });
      await seedCategory({
        categoryId: childId,
        parentCategoryId: rootId,
        name: 'Child',
        ancestorIds: [rootId],
      });

      await seedItem(randomUUID(), typeId, orgId, [rootId]);
      await seedItem(randomUUID(), typeId, orgId, [childId]);
      await seedItem(randomUUID(), typeId, orgId, [childId]);

      await categoryProjection.recalcAllCounts();

      const res = await agent.get('/categories').expect(200);

      const root = res.body.find((c: { categoryId: string }) => c.categoryId === rootId);
      expectDefined(root);
      // 1 direct + 2 from child = 3
      expect(root.itemCount).toBe(3);
    });

    it('should reset counts after category unpublished', async () => {
      const rootId = randomUUID();
      const childId = randomUUID();

      await seedCategory({ categoryId: rootId, parentCategoryId: null, name: 'Root' });
      await seedCategory({ categoryId: childId, parentCategoryId: rootId, name: 'Child' });

      await categoryProjection.recalcAllCounts();

      const res1 = await agent.get('/categories').expect(200);
      const root1 = res1.body.find((c: { categoryId: string }) => c.categoryId === rootId);
      expectDefined(root1);
      expect(root1.childCount).toBe(1);

      // Unpublish child
      await produce(categoryStreamingContract, {
        id: uuidv7(),
        type: 'category.unpublished',
        categoryId: childId,
        unpublishedAt: new Date().toISOString(),
      });

      await vi.waitFor(async () => {
        const cats = await db
          .select()
          .from(discoveryCategories)
          .where(eq(discoveryCategories.id, childId));
        expect(cats).toHaveLength(0);
      }, WAIT_OPTIONS);

      await categoryProjection.recalcAllCounts();

      const res2 = await agent.get('/categories').expect(200);
      const root2 = res2.body.find((c: { categoryId: string }) => c.categoryId === rootId);
      expectDefined(root2);
      expect(root2.childCount).toBe(0);
    });
  });

  // ─── GET /categories/:id/filters ─────────────────────────────────

  describe('GET /categories/:id/filters', () => {
    it('should return 404 for non-existent category', async () => {
      await agent.get(`/categories/${randomUUID()}/filters`).expect(404);
    });

    it('should return filters with attributes and type filters', async () => {
      const typeId = randomUUID();
      const categoryId = randomUUID();
      const attrId = randomUUID();

      await seedItemType(typeId, 'Service');
      await seedCategory({
        categoryId,
        parentCategoryId: null,
        name: 'With Filters',
        allowedTypeIds: [typeId],
        attributes: [
          { attributeId: attrId, name: 'Color', required: true, schema: { type: 'text' } },
        ],
      });

      const res = await agent.get(`/categories/${categoryId}/filters`).expect(200);

      expect(res.body.categoryId).toBe(categoryId);

      expect(res.body.attributeFilters).toHaveLength(1);
      expect(res.body.attributeFilters[0]).toMatchObject({
        attributeId: attrId,
        name: 'Color',
      });

      expect(res.body.typeFilters).toHaveLength(1);
      expect(res.body.typeFilters[0]).toMatchObject({
        typeId,
        name: 'Service',
      });
    });

    it('should merge attributes from ancestors with deduplication', async () => {
      const grandparentId = randomUUID();
      const parentId = randomUUID();
      const childId = randomUUID();
      const attrA = randomUUID();
      const attrB = randomUUID();
      const attrC = randomUUID();

      await seedCategory({
        categoryId: grandparentId,
        parentCategoryId: null,
        name: 'Grandparent',
        attributes: [
          { attributeId: attrA, name: 'Color', required: false, schema: { type: 'text' } },
        ],
      });
      await seedCategory({
        categoryId: parentId,
        parentCategoryId: grandparentId,
        name: 'Parent',
        ancestorIds: [grandparentId],
        attributes: [
          { attributeId: attrB, name: 'Size', required: true, schema: { type: 'number' } },
        ],
      });
      await seedCategory({
        categoryId: childId,
        parentCategoryId: parentId,
        name: 'Child',
        ancestorIds: [grandparentId, parentId],
        attributes: [
          { attributeId: attrA, name: 'Color Override', required: true, schema: { type: 'text' } },
          { attributeId: attrC, name: 'Weight', required: false, schema: { type: 'number' } },
        ],
      });

      const res = await agent.get(`/categories/${childId}/filters`).expect(200);

      expect(res.body.attributeFilters).toHaveLength(3);

      const colorAttr = res.body.attributeFilters.find(
        (a: { attributeId: string }) => a.attributeId === attrA,
      );
      expectDefined(colorAttr);
      expect(colorAttr.name).toBe('Color Override');

      const sizeAttr = res.body.attributeFilters.find(
        (a: { attributeId: string }) => a.attributeId === attrB,
      );
      expectDefined(sizeAttr);
      expect(sizeAttr.name).toBe('Size');

      const weightAttr = res.body.attributeFilters.find(
        (a: { attributeId: string }) => a.attributeId === attrC,
      );
      expectDefined(weightAttr);
      expect(weightAttr.name).toBe('Weight');
    });

    it('should return commonFilters with all fields true', async () => {
      const categoryId = randomUUID();

      await seedCategory({ categoryId, parentCategoryId: null, name: 'Simple' });

      const res = await agent.get(`/categories/${categoryId}/filters`).expect(200);

      expect(res.body.commonFilters).toEqual({
        hasPriceRange: true,
        hasRating: true,
        hasLocation: true,
        hasSchedule: true,
        hasEventDateTime: true,
      });
      expect(res.body.attributeFilters).toEqual([]);
      expect(res.body.typeFilters).toEqual([]);
    });
  });
});

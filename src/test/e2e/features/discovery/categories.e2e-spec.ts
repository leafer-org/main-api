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
import { GorseSyncStub } from '@/features/discovery/adapters/gorse/gorse-sync.stub.js';
import { RecommendationStub } from '@/features/discovery/adapters/gorse/recommendation.stub.js';
import { RecommendationService } from '@/features/discovery/application/ports.js';
import { CategoryProjectionPort } from '@/features/discovery/application/projection-ports.js';
import { GorseSyncPort } from '@/features/discovery/application/sync-ports.js';
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

describe('discovery-categories', () => {
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
    iconId?: string;
    order?: number;
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
      iconId: params.iconId ?? randomUUID(),
      order: params.order ?? 0,
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
      label: name.toLowerCase(),
      widgetSettings: [{ type: 'base-info', required: true }],
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
        { type: 'base-info', title: 'Test Item', description: 'Desc', media: [] },
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
      .overrideProvider(GorseSyncPort)
      .useClass(GorseSyncStub)
      .overrideProvider(RecommendationService)
      .useClass(RecommendationStub)
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
    it('возвращает пустой массив при отсутствии категорий', async () => {
      const res = await agent.get('/categories').expect(200);
      expect(res.body).toEqual([]);
    });

    it('возвращает корневые категории', async () => {
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

    it('возвращает детей по parentCategoryId', async () => {
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

    it('возвращает корректный childCount после recalc', async () => {
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

    it('возвращает корректный прямой itemCount после recalc', async () => {
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

    it('аккумулирует itemCount от детей к родителю', async () => {
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

    it('сортирует категории по order asc, затем по name asc', async () => {
      const ids = {
        last: randomUUID(),
        first: randomUUID(),
        middleA: randomUUID(),
        middleB: randomUUID(),
      };

      await seedCategory({ categoryId: ids.last, parentCategoryId: null, name: 'Zzz', order: 99 });
      await seedCategory({ categoryId: ids.first, parentCategoryId: null, name: 'Aaa', order: 1 });
      await seedCategory({ categoryId: ids.middleA, parentCategoryId: null, name: 'Bbb', order: 50 });
      await seedCategory({ categoryId: ids.middleB, parentCategoryId: null, name: 'Ccc', order: 50 });

      const res = await agent.get('/categories').expect(200);
      const categoryIds = (res.body as { categoryId: string }[]).map((c: { categoryId: string }) => c.categoryId);

      expect(categoryIds).toEqual([ids.first, ids.middleA, ids.middleB, ids.last]);
    });

    it('сбрасывает счётчики после unpublish категории', async () => {
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
    it('возвращает 404 для несуществующей категории', async () => {
      await agent.get(`/categories/${randomUUID()}/filters`).expect(404);
    });

    it('возвращает фильтры с attributes и type filters', async () => {
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

    it('возвращает commonFilters со всеми полями true', async () => {
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

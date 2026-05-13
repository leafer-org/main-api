import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { uuidv7 } from 'uuidv7';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { seedCmsCategory, seedCmsItemType } from '../../helpers/cms-seed.js';
import { startContainers, stopContainers } from '../../helpers/containers.js';
import { runMigrations, seedAdminUser, seedStaticRoles, truncateAll } from '../../helpers/db.js';
import { seedItemPublished } from '../../helpers/organization-seed.js';
import { waitForAllConsumers } from '../../helpers/kafka.js';
import { createBuckets } from '../../helpers/s3.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { DiscoveryDatabaseClient } from '@/features/discovery/adapters/db/client.js';
import { discoveryItems } from '@/features/discovery/adapters/db/schema.js';
import { GorseSyncStub } from '@/features/discovery/adapters/gorse/gorse-sync.stub.js';
import { RecommendationStub } from '@/features/discovery/adapters/gorse/recommendation.stub.js';
import { RecommendationService } from '@/features/discovery/application/ports.js';
import { GorseSyncPort, MeilisearchSyncPort } from '@/features/discovery/application/sync-ports.js';
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

  async function produce<C extends Contract>(contract: C, message: ContractMessage<C>) {
    producer.send(contract, message);
    await producer.flush();
  }

  /**
   * Сидим категорию в cms write-side и эмитим тонкое событие — discovery
   * читает свежий state через CategoryDirectoryPort при следующем запросе.
   */
  async function seedCategory(params: {
    categoryId: string;
    parentCategoryId: string | null;
    name: string;
    iconId?: string;
    order?: number;
    allowedTypeIds?: string[];
    attributes?: { attributeId: string; name: string; required: boolean; schema: object }[];
  }) {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await seedCmsCategory(process.env.DB_URL, {
      id: params.categoryId,
      parentCategoryId: params.parentCategoryId,
      name: params.name,
      iconId: params.iconId,
      order: params.order,
      allowedTypeIds: params.allowedTypeIds,
      attributes: params.attributes,
      status: 'published',
    });

    await produce(categoryStreamingContract, {
      id: uuidv7(),
      type: 'category.changed',
      categoryId: params.categoryId,
      changedAt: new Date().toISOString(),
    });
  }

  async function seedItemType(typeId: string, name: string) {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await seedCmsItemType(process.env.DB_URL, {
      id: typeId,
      name,
      label: name.toLowerCase(),
      widgetSettings: [{ type: 'base-info', required: true }],
    });
    await produce(itemTypeStreamingContract, {
      id: uuidv7(),
      type: 'item-type.changed',
      typeId,
      changedAt: new Date().toISOString(),
    });
  }

  async function seedItem(itemId: string, typeId: string, orgId: string, categoryIds: string[]) {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    const widgets = [
      { type: 'base-info', title: 'Test Item', description: 'Desc', media: [] },
      { type: 'owner', organizationId: orgId, name: 'Org', avatarId: null },
      { type: 'category', categoryIds, attributes: [] },
    ];
    await seedItemPublished(process.env.DB_URL, {
      id: itemId,
      organizationId: orgId,
      typeId,
      widgets,
    });
    await produce(itemStreamingContract, {
      id: uuidv7(),
      type: 'item.changed',
      itemId,
      changedAt: new Date().toISOString(),
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

    it('возвращает iconUrl вместо iconId', async () => {
      const rootId = randomUUID();
      await seedCategory({ categoryId: rootId, parentCategoryId: null, name: 'Root' });

      const res = await agent.get('/categories').expect(200);

      expect(res.body).toHaveLength(1);
      const [category] = res.body as { iconUrl: unknown; iconId?: unknown }[];
      expectDefined(category);
      expect(category.iconUrl).toEqual(expect.any(String));
      expect(category).not.toHaveProperty('iconId');
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
      const categoryIds = (res.body as { categoryId: string }[]).map((c) => c.categoryId);

      expect(categoryIds).toEqual([ids.first, ids.middleA, ids.middleB, ids.last]);
    });

    it('переиндексирует items в Gorse и Meilisearch при republish их категории', async () => {
      const rootAId = randomUUID();
      const rootBId = randomUUID();
      const categoryId = randomUUID();
      const typeId = randomUUID();
      const orgId = randomUUID();
      const itemId = randomUUID();

      await seedCategory({ categoryId: rootAId, parentCategoryId: null, name: 'Root A' });
      await seedCategory({ categoryId: rootBId, parentCategoryId: null, name: 'Root B' });
      await seedCategory({ categoryId, parentCategoryId: rootAId, name: 'Cat' });
      await seedItem(itemId, typeId, orgId, [categoryId]);

      const gorseSpy = vi.spyOn(app.get(GorseSyncPort), 'upsertItem');
      const meiliSpy = vi.spyOn(app.get(MeilisearchSyncPort), 'upsertItems');
      gorseSpy.mockClear();
      meiliSpy.mockClear();

      // Republish с новым родителем — обновляем cms write-side, эмитим thin event
      if (!process.env.DB_URL) throw new Error('DB_URL not set');
      await seedCmsCategory(process.env.DB_URL, {
        id: categoryId,
        parentCategoryId: rootBId,
        name: 'Cat',
        status: 'published',
      });
      await produce(categoryStreamingContract, {
        id: uuidv7(),
        type: 'category.changed',
        categoryId,
        changedAt: new Date().toISOString(),
      });

      await vi.waitFor(() => {
        expect(gorseSpy).toHaveBeenCalled();
        expect(meiliSpy).toHaveBeenCalled();
      }, WAIT_OPTIONS);

      const gorseItemIds = gorseSpy.mock.calls.map((c) => String(c[0].itemId));
      expect(gorseItemIds).toContain(itemId);

      const meiliItemIds = meiliSpy.mock.calls.flatMap((c) => c[0].map((i) => String(i.itemId)));
      expect(meiliItemIds).toContain(itemId);
    });

    it('исчезает из выдачи после unpublish', async () => {
      const rootId = randomUUID();
      const childId = randomUUID();

      await seedCategory({ categoryId: rootId, parentCategoryId: null, name: 'Root' });
      await seedCategory({ categoryId: childId, parentCategoryId: rootId, name: 'Child' });

      const res1 = await agent.get('/categories').query({ parentCategoryId: rootId }).expect(200);
      expect(res1.body).toHaveLength(1);

      if (!process.env.DB_URL) throw new Error('DB_URL not set');
      await seedCmsCategory(process.env.DB_URL, {
        id: childId,
        parentCategoryId: rootId,
        name: 'Child',
        status: 'unpublished',
      });

      const res2 = await agent.get('/categories').query({ parentCategoryId: rootId }).expect(200);
      expect(res2.body).toHaveLength(0);
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

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
import { seedItemPublished, seedOrganizationPublished } from '../../helpers/organization-seed.js';
import { waitForAllConsumers } from '../../helpers/kafka.js';
import { createBuckets } from '../../helpers/s3.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { DiscoveryDatabaseClient } from '@/features/discovery/adapters/db/client.js';
import { discoveryItems, discoveryOwners } from '@/features/discovery/adapters/db/schema.js';
import { GorseSyncStub } from '@/features/discovery/adapters/gorse/gorse-sync.stub.js';
import { RecommendationStub } from '@/features/discovery/adapters/gorse/recommendation.stub.js';
import { RecommendationService } from '@/features/discovery/application/ports.js';
import { GorseSyncPort } from '@/features/discovery/application/sync-ports.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';
import { categoryStreamingContract } from '@/infra/kafka-contracts/category.contract.js';
import { itemStreamingContract } from '@/infra/kafka-contracts/item.contract.js';
import { itemTypeStreamingContract } from '@/infra/kafka-contracts/item-type.contract.js';
import { organizationStreamingContract } from '@/infra/kafka-contracts/organization.contract.js';
import type { Contract, ContractMessage } from '@/infra/lib/nest-kafka/contract/contract.js';
import { KafkaProducerService } from '@/infra/lib/nest-kafka/producer/kafka-producer.service.js';
import { AgeGroupOption } from '@/kernel/domain/vo/age-group.js';

const FIXED_OTP = '123456';
const WAIT_OPTIONS = { timeout: 15_000, interval: 500 };
const CITY_ID = 'test-city-1';

function expectDefined<T>(value: T | undefined): asserts value is T {
  expect(value).toBeDefined();
}

function sleep(t = 100) {
  return new Promise((res) => setTimeout(() => res(undefined), t));
}

describe('discovery-search-suggestions', () => {
  let app: INestApplication;
  let agent: ReturnType<typeof request>;
  let producer: KafkaProducerService;
  let db: DiscoveryDatabaseClient;

  async function produce<C extends Contract>(contract: C, message: ContractMessage<C>) {
    producer.send(contract, message);
    await producer.flush();
  }

  async function seedCategory(name: string): Promise<string> {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    const categoryId = randomUUID();
    await seedCmsCategory(process.env.DB_URL, {
      id: categoryId,
      parentCategoryId: null,
      name,
      status: 'published',
    });
    // category.changed апдейтит Meili-индекс search-suggestions; ждём появления в подсказках.
    await produce(categoryStreamingContract, {
      id: uuidv7(),
      type: 'category.changed',
      categoryId,
      changedAt: new Date().toISOString(),
    });
    await vi.waitFor(async () => {
      const res = await agent.get('/search-suggestions').query({ query: name }).expect(200);
      const found = (res.body.categories ?? []).some(
        (c: { categoryId: string }) => c.categoryId === categoryId,
      );
      expect(found).toBe(true);
    }, WAIT_OPTIONS);
    return categoryId;
  }

  async function seedItemType(name: string): Promise<string> {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    const typeId = randomUUID();
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
    await vi.waitFor(async () => {
      const res = await agent.get('/search-suggestions').query({ query: name }).expect(200);
      const found = (res.body.itemTypes ?? []).some(
        (t: { typeId: string }) => t.typeId === typeId,
      );
      expect(found).toBe(true);
    }, WAIT_OPTIONS);
    return typeId;
  }

  async function seedOrganization(name: string): Promise<string> {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    const orgId = randomUUID();
    await seedOrganizationPublished(process.env.DB_URL, {
      id: orgId,
      name,
      avatarId: null,
      media: [],
      published: true,
    });
    await produce(organizationStreamingContract, {
      id: uuidv7(),
      type: 'organization.changed',
      organizationId: orgId,
      changedAt: new Date().toISOString(),
    });
    await vi.waitFor(async () => {
      const [row] = await db
        .select()
        .from(discoveryOwners)
        .where(eq(discoveryOwners.id, orgId));
      expectDefined(row);
    }, WAIT_OPTIONS);
    return orgId;
  }

  async function seedItem(opts: { title: string; cityId?: string; ageGroup?: string } = { title: '' }) {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    const itemId = randomUUID();
    const typeId = randomUUID();
    const orgId = randomUUID();
    const widgets = [
      { type: 'base-info', title: opts.title, description: 'Desc', media: [] },
      { type: 'owner', organizationId: orgId, name: 'Org', avatarId: null },
      { type: 'category', categoryIds: [], attributes: [] },
      { type: 'location', cityId: opts.cityId ?? CITY_ID, lat: 55.75, lng: 37.62, address: 'A' },
      { type: 'age-group', value: AgeGroupOption.restore(opts.ageGroup ?? 'adults') },
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
    // Wait for Meilisearch indexing
    await vi.waitFor(async () => {
      const res = await agent.get('/search').query({
        query: opts.title,
        cityId: opts.cityId ?? CITY_ID,
      });
      const body = res.body as { items: Array<{ itemId: string }> };
      expect(body.items.some((i) => i.itemId === itemId)).toBe(true);
    }, WAIT_OPTIONS);
    return itemId;
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

  // ─── GET /search/suggestions ───────────────────────────────────────

  describe('GET /search/suggestions', () => {
    it('возвращает категории по имени (LIKE)', async () => {
      await seedCategory('Йога');
      await seedCategory('Бокс');

      const res = await agent
        .get('/search/suggestions')
        .query({ query: 'йог', cityId: CITY_ID })
        .expect(200);

      expect(res.body.categories).toHaveLength(1);
      expect(res.body.categories[0].name).toBe('Йога');
    });

    it('возвращает типы товаров по имени (LIKE)', async () => {
      await seedItemType('Услуга');
      await seedItemType('Мероприятие');

      const res = await agent
        .get('/search/suggestions')
        .query({ query: 'услуг', cityId: CITY_ID })
        .expect(200);

      expect(res.body.itemTypes).toHaveLength(1);
      expect(res.body.itemTypes[0].name).toBe('Услуга');
    });

    it('возвращает организации по имени (LIKE)', async () => {
      const orgId = await seedOrganization('Студия йоги «Прана»');
      await seedOrganization('Кофейня «Зерно»');

      const res = await agent
        .get('/search/suggestions')
        .query({ query: 'йоги', cityId: CITY_ID })
        .expect(200);

      expect(res.body.organizations).toHaveLength(1);
      expect(res.body.organizations[0]).toMatchObject({
        organizationId: orgId,
        name: 'Студия йоги «Прана»',
      });
    });

    it('возвращает товары через MeiliSearch', async () => {
      const itemId = await seedItem({ title: 'Йога утром' });
      await seedItem({ title: 'Бокс вечером' });

      const res = await agent
        .get('/search/suggestions')
        .query({ query: 'Йога', cityId: CITY_ID })
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].itemId).toBe(itemId);
    });

    it('при пустом query возвращает все секции пустыми', async () => {
      await seedCategory('Йога');
      await agent.get('/search').query({ query: 'плавание', cityId: CITY_ID });
      await sleep(200);

      const res = await agent
        .get('/search/suggestions')
        .query({ cityId: CITY_ID })
        .expect(200);

      expect(res.body.categories).toHaveLength(0);
      expect(res.body.itemTypes).toHaveLength(0);
      expect(res.body.items).toHaveLength(0);
      expect(res.body.popularQueries).toHaveLength(0);
    });

    it('популярные запросы фильтруются по подстроке и сортируются по count', async () => {
      // 'йога утром' x2, 'йога вечером' x1, 'плавание' x1 — ожидаем при query='йога'
      // обе йога-записи (без точного совпадения), плавание не попадает.
      await agent.get('/search').query({ query: 'йога утром', cityId: CITY_ID });
      await agent.get('/search').query({ query: 'йога утром', cityId: CITY_ID });
      await agent.get('/search').query({ query: 'йога вечером', cityId: CITY_ID });
      await agent.get('/search').query({ query: 'плавание', cityId: CITY_ID });
      await sleep(200);

      const res = await agent
        .get('/search/suggestions')
        .query({ query: 'йога', cityId: CITY_ID })
        .expect(200);

      const popular = (res.body.popularQueries as { text: string }[]).map((q) => q.text);
      expect(popular).toEqual(['йога утром', 'йога вечером']);
    });

    it('популярные запросы фильтруются по cityId', async () => {
      await agent.get('/search').query({ query: 'аква-аэробика', cityId: 'city-a' });
      await agent.get('/search').query({ query: 'степ-аэробика', cityId: 'city-b' });
      await sleep(200);

      const resA = await agent
        .get('/search/suggestions')
        .query({ query: 'аэробика', cityId: 'city-a' })
        .expect(200);

      const popularA = (resA.body.popularQueries as { text: string }[]).map((q) => q.text);
      expect(popularA).toContain('аква-аэробика');
      expect(popularA).not.toContain('степ-аэробика');
    });

    it('исключает точное совпадение из популярных запросов', async () => {
      // 'йога' x3 в логе, при query='йога' она НЕ должна попасть в popularQueries.
      await agent.get('/search').query({ query: 'йога', cityId: CITY_ID });
      await agent.get('/search').query({ query: 'йога', cityId: CITY_ID });
      await agent.get('/search').query({ query: 'йога', cityId: CITY_ID });
      await sleep(200);

      const res = await agent
        .get('/search/suggestions')
        .query({ query: 'йога', cityId: CITY_ID })
        .expect(200);

      const popular = (res.body.popularQueries as { text: string }[]).map((q) => q.text);
      expect(popular).not.toContain('йога');
    });

    it('возвращает корректную структуру ответа', async () => {
      const res = await agent
        .get('/search/suggestions')
        .query({ query: 'foo', cityId: CITY_ID })
        .expect(200);

      expect(res.body).toHaveProperty('categories');
      expect(res.body).toHaveProperty('itemTypes');
      expect(res.body).toHaveProperty('organizations');
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('popularQueries');
      expect(Array.isArray(res.body.categories)).toBe(true);
      expect(Array.isArray(res.body.itemTypes)).toBe(true);
      expect(Array.isArray(res.body.organizations)).toBe(true);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(Array.isArray(res.body.popularQueries)).toBe(true);
    });
  });
});

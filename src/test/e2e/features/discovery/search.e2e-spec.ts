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
import { discoveryItems } from '@/features/discovery/adapters/db/schema.js';
import { GorseSyncStub } from '@/features/discovery/adapters/gorse/gorse-sync.stub.js';
import { RecommendationStub } from '@/features/discovery/adapters/gorse/recommendation.stub.js';
import { RecommendationService } from '@/features/discovery/application/ports.js';
import { GorseSyncPort } from '@/features/discovery/application/sync-ports.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';
import { itemStreamingContract } from '@/infra/kafka-contracts/item.contract.js';
import type { Contract, ContractMessage } from '@/infra/lib/nest-kafka/contract/contract.js';
import { KafkaProducerService } from '@/infra/lib/nest-kafka/producer/kafka-producer.service.js';
import type { CategoryId, OrganizationId } from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo/role.js';
import type { ItemWidget, PaymentStrategy } from '@/kernel/domain/vo/widget.js';

const FIXED_OTP = '123456';
const WAIT_OPTIONS = { timeout: 15_000, interval: 500 };
const CITY_ID = 'test-city-1';

function expectDefined<T>(value: T | undefined): asserts value is T {
  expect(value).toBeDefined();
}

function sleep(t = 100) {
  return new Promise((res) => setTimeout(() => res(undefined), t));
}

describe('Discovery Search HTTP (e2e)', () => {
  let app: INestApplication;
  let agent: ReturnType<typeof request>;
  let producer: KafkaProducerService;
  let db: DiscoveryDatabaseClient;

  async function produce<C extends Contract>(contract: C, message: ContractMessage<C>) {
    producer.send(contract, message);
    await producer.flush();
  }

  async function seedItem(
    opts: {
      itemId?: string;
      title?: string;
      description?: string;
      cityId?: string;
      ageGroup?: AgeGroup;
      typeId?: string;
      categoryIds?: CategoryId[];
      price?: number | null;
      paymentStrategy?: PaymentStrategy | null;
      orgName?: string;
      address?: string;
    } = {},
  ) {
    const itemId = opts.itemId ?? randomUUID();
    const typeId = opts.typeId ?? randomUUID();
    const orgId = randomUUID();

    const widgets: ItemWidget[] = [
      {
        type: 'base-info',
        title: opts.title ?? 'Test Item',
        description: opts.description ?? 'Description',
        imageId: null,
      },
      {
        type: 'owner',
        organizationId: orgId as OrganizationId,
        name: opts.orgName ?? 'Test Org',
        avatarId: null,
      },
      {
        type: 'category',
        categoryIds: opts.categoryIds ?? [],
        attributes: [],
      },
      {
        type: 'location',
        cityId: opts.cityId ?? CITY_ID,
        lat: 55.75,
        lng: 37.62,
        address: opts.address ?? 'Test Address',
      },
      {
        type: 'age-group',
        value: opts.ageGroup ?? 'adults',
      },
    ];

    if (opts.paymentStrategy) {
      widgets.push({
        type: 'payment',
        strategy: opts.paymentStrategy,
        price: opts.price ?? null,
      });
    }

    await produce(itemStreamingContract, {
      id: uuidv7(),
      type: 'item.published',
      itemId,
      typeId,
      organizationId: orgId,
      widgets,
      republished: false,
      publishedAt: new Date().toISOString(),
    });

    // Wait for DB projection
    await vi.waitFor(async () => {
      const [row] = await db.select().from(discoveryItems).where(eq(discoveryItems.id, itemId));
      expectDefined(row);
    }, WAIT_OPTIONS);

    // Wait for MeiliSearch indexing (async after DB write)
    await vi.waitFor(async () => {
      const res = await agent.get('/search').query({
        query: opts.title ?? 'Test Item',
        cityId: opts.cityId ?? CITY_ID,
        ageGroup: (opts.ageGroup ?? 'adults') === 'all' ? 'adults' : (opts.ageGroup ?? 'adults'),
      });
      const body = res.body as { items: Array<{ itemId: string }>; total: number };
      const found = body.items.some((i) => i.itemId === itemId);
      expect(found).toBe(true);
    }, WAIT_OPTIONS);

    return { itemId, typeId, orgId };
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

  // ─── GET /search ──────────────────────────────────────────────

  describe('GET /search', () => {
    it('should return matching items by text query', async () => {
      const { itemId } = await seedItem({ title: 'Yoga class morning' });

      const res = await agent.get('/search').query({ query: 'Yoga', cityId: CITY_ID }).expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].itemId).toBe(itemId);
      expect(res.body.total).toBe(1);
    });

    it('should return empty results for non-matching query', async () => {
      await seedItem({ title: 'Cooking lesson' });

      const res = await agent
        .get('/search')
        .query({ query: 'xyznonexistent', cityId: CITY_ID })
        .expect(200);

      expect(res.body.items).toHaveLength(0);
      expect(res.body.total).toBe(0);
      expect(res.body.nextCursor).toBeNull();
    });

    it('should filter by cityId', async () => {
      await seedItem({ title: 'City A item', cityId: 'city-a' });
      await seedItem({ title: 'City B item', cityId: 'city-b' });

      const res = await agent.get('/search').query({ query: 'item', cityId: 'city-a' }).expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].title).toBe('City A item');
    });

    it('should filter by ageGroup (default is adults)', async () => {
      await seedItem({ title: 'Adults dance', ageGroup: 'adults' });
      await seedItem({ title: 'Children dance', ageGroup: 'children' });

      const res = await agent.get('/search').query({ query: 'dance', cityId: CITY_ID }).expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].title).toBe('Adults dance');
    });

    it('should include ageGroup "all" items in any search', async () => {
      await seedItem({ title: 'Universal art', ageGroup: 'all' });
      await seedItem({ title: 'Kids art', ageGroup: 'children' });

      // Search as adults (default)
      const adultsRes = await agent
        .get('/search')
        .query({ query: 'art', cityId: CITY_ID })
        .expect(200);

      expect(adultsRes.body.items).toHaveLength(1);
      expect(adultsRes.body.items[0].title).toBe('Universal art');

      // Search as children
      const childrenRes = await agent
        .get('/search')
        .query({ query: 'art', cityId: CITY_ID, ageGroup: 'children' })
        .expect(200);

      expect(childrenRes.body.items).toHaveLength(2);
      const titles = childrenRes.body.items.map((i: { title: string }) => i.title).sort();
      expect(titles).toEqual(['Kids art', 'Universal art']);
    });

    it('should filter by categoryIds', async () => {
      const catA = randomUUID();
      const catB = randomUUID();

      await seedItem({ title: 'Cat A item', categoryIds: [catA as CategoryId] });
      await seedItem({ title: 'Cat B item', categoryIds: [catB as CategoryId] });

      const res = await agent
        .get('/search')
        .query({ query: 'item', cityId: CITY_ID, categoryIds: catA })
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].title).toBe('Cat A item');
    });

    it('should filter by typeIds', async () => {
      const typeA = randomUUID();
      const typeB = randomUUID();

      await seedItem({ title: 'Type A service', typeId: typeA });
      await seedItem({ title: 'Type B service', typeId: typeB });

      const res = await agent
        .get('/search')
        .query({ query: 'service', cityId: CITY_ID, typeIds: typeA })
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].title).toBe('Type A service');
    });

    it('should filter by price range', async () => {
      await seedItem({ title: 'Cheap workshop', paymentStrategy: 'one-time', price: 500 });
      await seedItem({ title: 'Mid workshop', paymentStrategy: 'one-time', price: 1500 });
      await seedItem({ title: 'Expensive workshop', paymentStrategy: 'one-time', price: 5000 });

      const res = await agent
        .get('/search')
        .query({ query: 'workshop', cityId: CITY_ID, priceMin: 1000, priceMax: 2000 })
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].title).toBe('Mid workshop');
    });

    it('should paginate with cursor', async () => {
      await seedItem({ title: 'Paginate alpha' });
      await seedItem({ title: 'Paginate beta' });
      await seedItem({ title: 'Paginate gamma' });

      // First page
      const page1 = await agent
        .get('/search')
        .query({ query: 'Paginate', cityId: CITY_ID, limit: 2 })
        .expect(200);

      expect(page1.body.items).toHaveLength(2);
      expect(page1.body.nextCursor).not.toBeNull();
      expect(page1.body.total).toBe(3);

      // Second page
      const page2 = await agent
        .get('/search')
        .query({ query: 'Paginate', cityId: CITY_ID, limit: 2, cursor: page1.body.nextCursor })
        .expect(200);

      expect(page2.body.items).toHaveLength(1);
      expect(page2.body.nextCursor).toBeNull();

      // All items unique
      const allIds = [...page1.body.items, ...page2.body.items].map(
        (i: { itemId: string }) => i.itemId,
      );
      expect(new Set(allIds).size).toBe(3);
    });

    it('should return correct response shape', async () => {
      const { itemId } = await seedItem({
        title: 'Shape test item',
        description: 'A detailed description',
        paymentStrategy: 'one-time',
        price: 1000,
        orgName: 'Shape Org',
        address: 'Shape Street 1',
      });

      const res = await agent
        .get('/search')
        .query({ query: 'Shape test', cityId: CITY_ID })
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('facets');
      expect(res.body).toHaveProperty('nextCursor');
      expect(res.body).toHaveProperty('total');

      const item = res.body.items.find((i: { itemId: string }) => i.itemId === itemId);
      expectDefined(item);
      expect(item).toMatchObject({
        itemId,
        title: 'Shape test item',
        description: 'A detailed description',
        owner: { name: 'Shape Org', avatarId: null },
        location: { cityId: CITY_ID, address: 'Shape Street 1' },
      });
      expect(item).toHaveProperty('typeId');
      expect(item).toHaveProperty('price');
      expect(item).toHaveProperty('categoryIds');
    });
  });
});

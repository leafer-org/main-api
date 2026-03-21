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
import { discoveryCategories, discoveryItems } from '@/features/discovery/adapters/db/schema.js';
import { GorseSyncStub } from '@/features/discovery/adapters/gorse/gorse-sync.stub.js';
import { RecommendationStub } from '@/features/discovery/adapters/gorse/recommendation.stub.js';
import { RecommendationService } from '@/features/discovery/application/ports.js';
import { GorseSyncPort } from '@/features/discovery/application/sync-ports.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';
import type { OrgFilterId } from '@/features/tickets/domain/vo/filters.js';
import { categoryStreamingContract } from '@/infra/kafka-contracts/category.contract.js';
import { itemStreamingContract } from '@/infra/kafka-contracts/item.contract.js';
import type { Contract, ContractMessage } from '@/infra/lib/nest-kafka/contract/contract.js';
import { KafkaProducerService } from '@/infra/lib/nest-kafka/producer/kafka-producer.service.js';
import type { CategoryId, ItemId, OrganizationId } from '@/kernel/domain/ids.js';
import { AgeGroupOption } from '@/kernel/domain/vo/age-group.js';
import type { ItemWidget } from '@/kernel/domain/vo/widget.js';

const FIXED_OTP = '123456';
const WAIT_OPTIONS = { timeout: 15_000, interval: 500 };
const CITY_ID = 'test-city';
const AGE_GROUP = 'adults';

function expectDefined<T>(value: T | undefined): asserts value is T {
  expect(value).toBeDefined();
}

function sleep(t = 100) {
  return new Promise((res) => setTimeout(() => res(undefined), t));
}

describe('Discovery Category Items HTTP (e2e)', () => {
  let app: INestApplication;
  let agent: ReturnType<typeof request>;
  let producer: KafkaProducerService;
  let db: DiscoveryDatabaseClient;

  async function produce<C extends Contract>(contract: C, message: ContractMessage<C>) {
    producer.send(contract, message);
    await producer.flush();
  }

  async function seedCategory(params: {
    categoryId: string;
    parentCategoryId?: string | null;
    name?: string;
  }) {
    const categoryId = params.categoryId;
    await produce(categoryStreamingContract, {
      id: uuidv7(),
      type: 'category.published',
      categoryId,
      parentCategoryId: params.parentCategoryId ?? null,
      name: params.name ?? 'Test Category',
      iconId: randomUUID(),
      allowedTypeIds: [],
      ancestorIds: [],
      attributes: [],
      republished: false,
      publishedAt: new Date().toISOString(),
    });

    await vi.waitFor(async () => {
      const [row] = await db
        .select()
        .from(discoveryCategories)
        .where(eq(discoveryCategories.id, categoryId));
      expectDefined(row);
    }, WAIT_OPTIONS);
  }

  async function seedItem(params: {
    itemId: string;
    typeId: string;
    orgId: string;
    categoryIds: string[];
    price?: number | null;
    rating?: number | null;
    reviewCount?: number;
    cityId?: string;
    ageGroup?: string;
    title?: string;
    publishedAt?: string;
  }) {
    const widgets: ItemWidget[] = [
      { type: 'base-info', title: params.title ?? 'Test Item', description: 'Desc', media: [] },
      {
        type: 'owner',
        organizationId: params.orgId as OrganizationId,
        name: 'Org',
        avatarId: null,
      },
      { type: 'category', categoryIds: params.categoryIds as CategoryId[], attributes: [] },
      { type: 'location', cityId: params.cityId ?? CITY_ID, lat: 55.75, lng: 37.62, address: null },
      { type: 'age-group', value: AgeGroupOption.restore(params.ageGroup ?? AGE_GROUP) },
    ];

    if (params.price !== undefined) {
      widgets.push({
        type: 'payment',
        options: [{
          name: params.price === null ? 'Бесплатно' : 'Оплата',
          description: null,
          strategy: params.price === null ? 'free' : 'one-time',
          price: params.price,
        }],
      });
    }

    if (params.rating !== undefined) {
      widgets.push({
        type: 'item-review',
        rating: params.rating,
        reviewCount: params.reviewCount ?? 1,
      });
    }

    await produce(itemStreamingContract, {
      id: uuidv7(),
      type: 'item.published',
      itemId: params.itemId,
      typeId: params.typeId,
      organizationId: params.orgId,
      widgets,
      republished: false,
      publishedAt: params.publishedAt ?? new Date().toISOString(),
    });

    await vi.waitFor(async () => {
      const [row] = await db
        .select()
        .from(discoveryItems)
        .where(eq(discoveryItems.id, params.itemId));
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

  // ─── GET /categories/:id/items ────────────────────────────────────

  describe('GET /categories/:id/items', () => {
    it('should return empty result for category with no items', async () => {
      const categoryId = randomUUID();
      await seedCategory({ categoryId });

      const res = await agent
        .get(`/categories/${categoryId}/items`)
        .query({ sort: 'newest', cityId: CITY_ID, ageGroup: AGE_GROUP })
        .expect(200);

      expect(res.body.items).toEqual([]);
      expect(res.body.nextCursor).toBeNull();
    });

    it('should return items belonging to category with correct structure', async () => {
      const categoryId = randomUUID();
      const typeId = randomUUID();
      const orgId = randomUUID();
      const itemId = randomUUID();

      await seedCategory({ categoryId });
      await seedItem({
        itemId,
        typeId,
        orgId,
        categoryIds: [categoryId],
        price: 1000,
        rating: 4.5,
        reviewCount: 10,
      });

      const res = await agent
        .get(`/categories/${categoryId}/items`)
        .query({ sort: 'newest', cityId: CITY_ID, ageGroup: AGE_GROUP })
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      const item = res.body.items[0];
      expect(item.itemId).toBe(itemId);
      expect(item.typeId).toBe(typeId);
      expect(item.title).toBe('Test Item');
      expect(item.price).toMatchObject({ options: [{ name: 'Оплата', description: null, strategy: 'one-time', price: 1000 }] });
      expect(item.rating).toBe(4.5);
      expect(item.reviewCount).toBe(10);
      expect(item.owner).toMatchObject({ name: 'Org' });
      expect(item.categoryIds).toContain(categoryId);
    });

    // ─── Sorting ──────────────────────────────────────────────────

    describe('sorting', () => {
      it('sort=newest should return items ordered by publishedAt descending', async () => {
        const categoryId = randomUUID();
        const typeId = randomUUID();
        const orgId = randomUUID();
        const ids = [randomUUID(), randomUUID(), randomUUID()];

        await seedCategory({ categoryId });

        for (let i = 0; i < ids.length; i++) {
          const date = new Date(Date.now() - (ids.length - i) * 60_000);
          // biome-ignore lint/performance/noAwaitInLoops: test
          await seedItem({
            itemId: ids[i] as ItemId,
            typeId,
            orgId,
            categoryIds: [categoryId],
            title: `Item ${i}`,
            publishedAt: date.toISOString(),
          });
        }

        const res = await agent
          .get(`/categories/${categoryId}/items`)
          .query({ sort: 'newest', cityId: CITY_ID, ageGroup: AGE_GROUP })
          .expect(200);

        expect(res.body.items).toHaveLength(3);
        // Last seeded (index 2) has the latest publishedAt
        expect(res.body.items[0].itemId).toBe(ids[2]);
        expect(res.body.items[1].itemId).toBe(ids[1]);
        expect(res.body.items[2].itemId).toBe(ids[0]);
      });

      it('sort=price-asc should return items ordered by price ascending', async () => {
        const categoryId = randomUUID();
        const typeId = randomUUID();
        const orgId = randomUUID();
        const cheapId = randomUUID();
        const midId = randomUUID();
        const expensiveId = randomUUID();

        await seedCategory({ categoryId });
        await seedItem({
          itemId: expensiveId,
          typeId,
          orgId,
          categoryIds: [categoryId],
          price: 3000,
        });
        await seedItem({ itemId: cheapId, typeId, orgId, categoryIds: [categoryId], price: 500 });
        await seedItem({ itemId: midId, typeId, orgId, categoryIds: [categoryId], price: 1500 });

        const res = await agent
          .get(`/categories/${categoryId}/items`)
          .query({ sort: 'price-asc', cityId: CITY_ID, ageGroup: AGE_GROUP })
          .expect(200);

        expect(res.body.items).toHaveLength(3);
        expect(res.body.items[0].itemId).toBe(cheapId);
        expect(res.body.items[1].itemId).toBe(midId);
        expect(res.body.items[2].itemId).toBe(expensiveId);
      });

      it('sort=price-desc should return items ordered by price descending', async () => {
        const categoryId = randomUUID();
        const typeId = randomUUID();
        const orgId = randomUUID();
        const cheapId = randomUUID();
        const expensiveId = randomUUID();

        await seedCategory({ categoryId });
        await seedItem({ itemId: cheapId, typeId, orgId, categoryIds: [categoryId], price: 500 });
        await seedItem({
          itemId: expensiveId,
          typeId,
          orgId,
          categoryIds: [categoryId],
          price: 3000,
        });

        const res = await agent
          .get(`/categories/${categoryId}/items`)
          .query({ sort: 'price-desc', cityId: CITY_ID, ageGroup: AGE_GROUP })
          .expect(200);

        expect(res.body.items).toHaveLength(2);
        expect(res.body.items[0].itemId).toBe(expensiveId);
        expect(res.body.items[1].itemId).toBe(cheapId);
      });

      it('sort=rating-desc should return items ordered by rating descending', async () => {
        const categoryId = randomUUID();
        const typeId = randomUUID();
        const orgId = randomUUID();
        const lowId = randomUUID();
        const highId = randomUUID();

        await seedCategory({ categoryId });
        await seedItem({ itemId: lowId, typeId, orgId, categoryIds: [categoryId], rating: 2.0 });
        await seedItem({ itemId: highId, typeId, orgId, categoryIds: [categoryId], rating: 4.8 });

        const res = await agent
          .get(`/categories/${categoryId}/items`)
          .query({ sort: 'rating-desc', cityId: CITY_ID, ageGroup: AGE_GROUP })
          .expect(200);

        expect(res.body.items).toHaveLength(2);
        expect(res.body.items[0].itemId).toBe(highId);
        expect(res.body.items[1].itemId).toBe(lowId);
      });
    });

    // ─── Filtering ────────────────────────────────────────────────

    describe('filtering', () => {
      it('should filter by typeIds', async () => {
        const categoryId = randomUUID();
        const typeA = randomUUID();
        const typeB = randomUUID();
        const orgId = randomUUID();
        const itemA = randomUUID();
        const itemB = randomUUID();

        await seedCategory({ categoryId });
        await seedItem({ itemId: itemA, typeId: typeA, orgId, categoryIds: [categoryId] });
        await seedItem({ itemId: itemB, typeId: typeB, orgId, categoryIds: [categoryId] });

        const res = await agent
          .get(`/categories/${categoryId}/items`)
          .query({ sort: 'newest', cityId: CITY_ID, ageGroup: AGE_GROUP, typeIds: typeA })
          .expect(200);

        expect(res.body.items).toHaveLength(1);
        expect(res.body.items[0].itemId).toBe(itemA);
      });

      it('should filter by priceMin and priceMax', async () => {
        const categoryId = randomUUID();
        const typeId = randomUUID();
        const orgId = randomUUID();
        const cheapId = randomUUID();
        const midId = randomUUID();
        const expensiveId = randomUUID();

        await seedCategory({ categoryId });
        await seedItem({ itemId: cheapId, typeId, orgId, categoryIds: [categoryId], price: 100 });
        await seedItem({ itemId: midId, typeId, orgId, categoryIds: [categoryId], price: 500 });
        await seedItem({
          itemId: expensiveId,
          typeId,
          orgId,
          categoryIds: [categoryId],
          price: 2000,
        });

        const res = await agent
          .get(`/categories/${categoryId}/items`)
          .query({
            sort: 'price-asc',
            cityId: CITY_ID,
            ageGroup: AGE_GROUP,
            priceMin: '200',
            priceMax: '1000',
          })
          .expect(200);

        expect(res.body.items).toHaveLength(1);
        expect(res.body.items[0].itemId).toBe(midId);
      });

      it('should filter by minRating', async () => {
        const categoryId = randomUUID();
        const typeId = randomUUID();
        const orgId = randomUUID();
        const lowId = randomUUID();
        const highId = randomUUID();

        await seedCategory({ categoryId });
        await seedItem({ itemId: lowId, typeId, orgId, categoryIds: [categoryId], rating: 2.0 });
        await seedItem({ itemId: highId, typeId, orgId, categoryIds: [categoryId], rating: 4.5 });

        const res = await agent
          .get(`/categories/${categoryId}/items`)
          .query({
            sort: 'newest',
            cityId: CITY_ID,
            ageGroup: AGE_GROUP,
            minRating: '4.0',
          })
          .expect(200);

        expect(res.body.items).toHaveLength(1);
        expect(res.body.items[0].itemId).toBe(highId);
      });
    });

    // ─── Pagination ───────────────────────────────────────────────

    describe('pagination', () => {
      it('should paginate with cursor', async () => {
        const categoryId = randomUUID();
        const typeId = randomUUID();
        const orgId = randomUUID();

        await seedCategory({ categoryId });

        const itemIds: string[] = [];
        for (let i = 0; i < 5; i++) {
          const id = randomUUID();
          itemIds.push(id);
          const date = new Date(Date.now() - (5 - i) * 60_000);
          await seedItem({
            itemId: id,
            typeId,
            orgId,
            categoryIds: [categoryId],
            publishedAt: date.toISOString(),
          });
        }

        // Page 1
        const page1 = await agent
          .get(`/categories/${categoryId}/items`)
          .query({ sort: 'newest', cityId: CITY_ID, ageGroup: AGE_GROUP, limit: '2' })
          .expect(200);

        expect(page1.body.items).toHaveLength(2);
        expect(page1.body.nextCursor).not.toBeNull();

        // Page 2
        const page2 = await agent
          .get(`/categories/${categoryId}/items`)
          .query({
            sort: 'newest',
            cityId: CITY_ID,
            ageGroup: AGE_GROUP,
            limit: '2',
            cursor: page1.body.nextCursor,
          })
          .expect(200);

        expect(page2.body.items).toHaveLength(2);
        expect(page2.body.nextCursor).not.toBeNull();

        // Page 3 — last item
        const page3 = await agent
          .get(`/categories/${categoryId}/items`)
          .query({
            sort: 'newest',
            cityId: CITY_ID,
            ageGroup: AGE_GROUP,
            limit: '2',
            cursor: page2.body.nextCursor,
          })
          .expect(200);

        expect(page3.body.items).toHaveLength(1);
        expect(page3.body.nextCursor).toBeNull();

        // All items are unique across pages
        const allIds = [
          ...page1.body.items.map((i: { itemId: string }) => i.itemId),
          ...page2.body.items.map((i: { itemId: string }) => i.itemId),
          ...page3.body.items.map((i: { itemId: string }) => i.itemId),
        ];
        expect(new Set(allIds).size).toBe(5);
      });
    });

    // ─── AgeGroup isolation ──────────────────────────────────────

    describe('ageGroup isolation', () => {
      it('should not return adults items when querying ageGroup=children', async () => {
        const categoryId = randomUUID();
        const typeId = randomUUID();
        const orgId = randomUUID();

        await seedCategory({ categoryId });
        await seedItem({
          itemId: randomUUID(),
          typeId,
          orgId,
          categoryIds: [categoryId],
          ageGroup: 'adults',
        });

        const res = await agent
          .get(`/categories/${categoryId}/items`)
          .query({ sort: 'newest', cityId: CITY_ID, ageGroup: 'children' })
          .expect(200);

        expect(res.body.items).toEqual([]);
      });

      it('should not return children items when querying ageGroup=adults', async () => {
        const categoryId = randomUUID();
        const typeId = randomUUID();
        const orgId = randomUUID();

        await seedCategory({ categoryId });
        await seedItem({
          itemId: randomUUID(),
          typeId,
          orgId,
          categoryIds: [categoryId],
          ageGroup: 'children',
        });

        const res = await agent
          .get(`/categories/${categoryId}/items`)
          .query({ sort: 'newest', cityId: CITY_ID, ageGroup: 'adults' })
          .expect(200);

        expect(res.body.items).toEqual([]);
      });

      it('should return ageGroup=all items for both children and adults queries', async () => {
        const categoryId = randomUUID();
        const typeId = randomUUID();
        const orgId = randomUUID();
        const itemId = randomUUID();

        await seedCategory({ categoryId });
        await seedItem({
          itemId,
          typeId,
          orgId,
          categoryIds: [categoryId],
          ageGroup: 'all',
        });

        const adultsRes = await agent
          .get(`/categories/${categoryId}/items`)
          .query({ sort: 'newest', cityId: CITY_ID, ageGroup: 'adults' })
          .expect(200);
        expect(adultsRes.body.items).toHaveLength(1);

        const childrenRes = await agent
          .get(`/categories/${categoryId}/items`)
          .query({ sort: 'newest', cityId: CITY_ID, ageGroup: 'children' })
          .expect(200);
        expect(childrenRes.body.items).toHaveLength(1);
      });
    });

    // ─── City isolation ───────────────────────────────────────────

    describe('city isolation', () => {
      it('should not return items from a different city', async () => {
        const categoryId = randomUUID();
        const typeId = randomUUID();
        const orgId = randomUUID();

        await seedCategory({ categoryId });
        await seedItem({
          itemId: randomUUID(),
          typeId,
          orgId,
          categoryIds: [categoryId],
          cityId: 'other-city',
        });

        const res = await agent
          .get(`/categories/${categoryId}/items`)
          .query({ sort: 'newest', cityId: CITY_ID, ageGroup: AGE_GROUP })
          .expect(200);

        expect(res.body.items).toEqual([]);
      });
    });

    // ─── Combined filters ─────────────────────────────────────────

    describe('combined filters', () => {
      it('should filter by typeIds AND priceRange simultaneously', async () => {
        const categoryId = randomUUID();
        const typeA = randomUUID();
        const typeB = randomUUID();
        const orgId = randomUUID();
        const matchId = randomUUID();
        const wrongTypeId = randomUUID();
        const wrongPriceId = randomUUID();

        await seedCategory({ categoryId });
        // Match: correct type + correct price
        await seedItem({
          itemId: matchId,
          typeId: typeA,
          orgId,
          categoryIds: [categoryId],
          price: 500,
        });
        // Wrong type
        await seedItem({
          itemId: wrongTypeId,
          typeId: typeB,
          orgId,
          categoryIds: [categoryId],
          price: 500,
        });
        // Wrong price
        await seedItem({
          itemId: wrongPriceId,
          typeId: typeA,
          orgId,
          categoryIds: [categoryId],
          price: 5000,
        });

        const res = await agent
          .get(`/categories/${categoryId}/items`)
          .query({
            sort: 'newest',
            cityId: CITY_ID,
            ageGroup: AGE_GROUP,
            typeIds: typeA,
            priceMax: '1000',
          })
          .expect(200);

        expect(res.body.items).toHaveLength(1);
        expect(res.body.items[0].itemId).toBe(matchId);
      });

      it('should filter by minRating AND typeIds simultaneously', async () => {
        const categoryId = randomUUID();
        const typeA = randomUUID();
        const orgId = randomUUID();
        const matchId = randomUUID();
        const lowRatingId = randomUUID();

        await seedCategory({ categoryId });
        await seedItem({
          itemId: matchId,
          typeId: typeA,
          orgId,
          categoryIds: [categoryId],
          rating: 4.5,
        });
        await seedItem({
          itemId: lowRatingId,
          typeId: typeA,
          orgId,
          categoryIds: [categoryId],
          rating: 2.0,
        });

        const res = await agent
          .get(`/categories/${categoryId}/items`)
          .query({
            sort: 'newest',
            cityId: CITY_ID,
            ageGroup: AGE_GROUP,
            typeIds: typeA,
            minRating: '4.0',
          })
          .expect(200);

        expect(res.body.items).toHaveLength(1);
        expect(res.body.items[0].itemId).toBe(matchId);
      });
    });

    // ─── Defaults ─────────────────────────────────────────────────

    describe('defaults', () => {
      it('should work with default sort (personal) and fallback to SQL', async () => {
        const categoryId = randomUUID();
        const typeId = randomUUID();
        const orgId = randomUUID();

        await seedCategory({ categoryId });
        await seedItem({ itemId: randomUUID(), typeId, orgId, categoryIds: [categoryId] });

        const res = await agent
          .get(`/categories/${categoryId}/items`)
          .query({ cityId: CITY_ID, ageGroup: AGE_GROUP })
          .expect(200);

        expect(res.body.items).toHaveLength(1);
      });

      it('should use default limit of 20', async () => {
        const categoryId = randomUUID();
        const typeId = randomUUID();
        const orgId = randomUUID();

        await seedCategory({ categoryId });
        await seedItem({ itemId: randomUUID(), typeId, orgId, categoryIds: [categoryId] });

        const res = await agent
          .get(`/categories/${categoryId}/items`)
          .query({ sort: 'newest', cityId: CITY_ID, ageGroup: AGE_GROUP })
          .expect(200);

        // With 1 item and default limit 20, should return the item
        expect(res.body.items).toHaveLength(1);
        expect(res.body.nextCursor).toBeNull();
      });
    });
  });
});

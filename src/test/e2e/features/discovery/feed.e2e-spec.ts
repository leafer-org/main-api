import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { uuidv7 } from 'uuidv7';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerUser } from '../../actors/auth.js';
import { startContainers, stopContainers } from '../../helpers/containers.js';
import { runMigrations, seedAdminUser, seedStaticRoles, truncateAll } from '../../helpers/db.js';
import {
  gorseGetUser,
  waitForGorsePopular,
  waitForGorseRecommendations,
} from '../../helpers/gorse.js';
import { waitForAllConsumers } from '../../helpers/kafka.js';
import { createBuckets } from '../../helpers/s3.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { DiscoveryDatabaseClient } from '@/features/discovery/adapters/db/client.js';
import { discoveryItems } from '@/features/discovery/adapters/db/schema.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';
import { interactionStreamingContract } from '@/infra/kafka-contracts/interaction.contract.js';
import { itemStreamingContract } from '@/infra/kafka-contracts/item.contract.js';
import { userGeoCategory } from '@/infra/lib/geo/h3-geo.js';
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

// ─── Shared app state ─────────────────────────────────────────────

let app: INestApplication;
let agent: ReturnType<typeof request>;
let producer: KafkaProducerService;
let db: DiscoveryDatabaseClient;

async function produce<C extends Contract>(contract: C, message: ContractMessage<C>) {
  producer.send(contract, message);
  await producer.flush();
}

async function seedItem(
  itemId: string,
  options?: {
    title?: string;
    cityId?: string;
    ageGroup?: string;
    orgId?: string;
    reviewCount?: number;
  },
) {
  const typeId = randomUUID();
  const orgId = options?.orgId ?? randomUUID();
  const cityId = options?.cityId ?? 'city-1';

  const widgets: unknown[] = [
    {
      type: 'base-info',
      title: options?.title ?? 'Test Item',
      description: 'Desc',
      media: [],
    },
    { type: 'owner', organizationId: orgId, name: 'Org', avatarId: null },
    { type: 'category', categoryIds: [], attributes: [] },
    { type: 'location', cityId, lat: 55.75, lng: 37.62, address: null },
    { type: 'age-group', value: options?.ageGroup ?? 'adults' },
  ];

  if (options?.reviewCount !== undefined) {
    widgets.push({ type: 'item-review', rating: 4.5, reviewCount: options.reviewCount });
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
  } as ContractMessage<typeof itemStreamingContract>);

  await vi.waitFor(async () => {
    const [row] = await db.select().from(discoveryItems).where(eq(discoveryItems.id, itemId));
    expectDefined(row);
  }, WAIT_OPTIONS);
}

async function sendInteraction(
  userId: string,
  itemId: string,
  interactionType: 'view' | 'like' | 'click',
) {
  await produce(interactionStreamingContract, {
    id: uuidv7(),
    type: 'interaction.recorded',
    userId,
    itemId,
    interactionType,
    timestamp: new Date().toISOString(),
  } as ContractMessage<typeof interactionStreamingContract>);
}

async function seedItems(
  count: number,
  options?: { cityId?: string; titlePrefix?: string; ageGroup?: string },
) {
  const ids = Array.from({ length: count }, () => randomUUID());

  // Items must be seeded sequentially — each waits for DB projection before the next
  let chain = Promise.resolve();
  ids.forEach((id, i) => {
    chain = chain.then(() =>
      seedItem(id, {
        cityId: options?.cityId ?? 'city-1',
        title: `${options?.titlePrefix ?? 'Item'} ${i}`,
        ...(options?.ageGroup ? { ageGroup: options.ageGroup } : {}),
      }),
    );
  });
  await chain;

  return ids;
}

async function sendBulkInteractions(
  userIds: string[],
  itemIds: string[],
  interactionType: 'view' | 'like' | 'click',
) {
  const tasks = userIds.flatMap((userId) =>
    itemIds.map((itemId) => sendInteraction(userId, itemId, interactionType)),
  );
  await Promise.all(tasks);
}

async function ensureSeeded() {
  if (!process.env.DB_URL) throw new Error('DB_URL not set');
  await seedStaticRoles(process.env.DB_URL);
  await seedAdminUser(process.env.DB_URL);
}

// ─── Bootstrap ────────────────────────────────────────────────────

beforeAll(async () => {
  await startContainers({ gorse: true });
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
  agent = request(app.getHttpServer());
});

afterAll(async () => {
  await app?.close();
  await stopContainers();
});

// ─── Фоллбэк: пустой ответ без данных в Gorse ──────────────────

describe('GET /feed (fallback)', () => {
  beforeEach(async () => {
    await ensureSeeded();
  });

  afterEach(async () => {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await truncateAll(process.env.DB_URL);
  });

  it('should return empty list when no items in Gorse', async () => {
    const res = await agent
      .get('/feed')
      .query({ cityId: 'city-unknown', ageGroup: 'adults' })
      .expect(200);

    expect(res.body.items).toEqual([]);
    expect(res.body.nextCursor).toBeNull();
  });
});

// ─── Популярные товары (анонимный пользователь) ─────────────────

describe('GET /feed (popular)', { timeout: 300_000 }, () => {
  const seededItemIds: string[] = [];

  beforeAll(async () => {
    await ensureSeeded();

    // Засидить 5 товаров через Kafka → ProjectItemHandler → DB + Gorse
    const ids = await seedItems(5, { titlePrefix: 'Popular Item' });
    seededItemIds.push(...ids);
    console.log('seeded');

    // Отправить interactions от 10 фейковых пользователей → ProjectInteractionHandler → Gorse feedback
    const fakeUserIds = Array.from({ length: 10 }, () => randomUUID());
    await sendBulkInteractions(fakeUserIds, seededItemIds, 'view');
    await sendBulkInteractions(fakeUserIds, seededItemIds, 'like');
    console.log('interactions');

    // Дать время handler-ам обработать все interactions
    await sleep(5000);
    console.log('sleeped');

    // Поллить /api/popular пока Gorse не сгенерирует популярные товары для нужной гео-категории
    const feedCategory = userGeoCategory(55.75, 37.62, 'adults');
    await waitForGorsePopular(120_000, 2_000, feedCategory);
  }, 240_000);

  it('should return popular items for anonymous user', async () => {
    const res = await agent
      .get('/feed')
      .query({ cityId: 'city-1', ageGroup: 'adults', lat: '55.75', lng: '37.62' })
      .expect(200);

    expect(res.body.items.length).toBeGreaterThan(0);
    const returnedIds = res.body.items.map((i: { itemId: string }) => i.itemId);
    const overlap = seededItemIds.filter((id) => returnedIds.includes(id));
    expect(overlap.length).toBeGreaterThan(0);
  });

  it('should return items with correct shape', async () => {
    const res = await agent
      .get('/feed')
      .query({ cityId: 'city-1', ageGroup: 'adults', lat: '55.75', lng: '37.62' })
      .expect(200);

    expect(res.body.items.length).toBeGreaterThan(0);
    const item = res.body.items[0];
    expect(item).toHaveProperty('itemId');
    expect(item).toHaveProperty('title');
    expect(item).toHaveProperty('description');
    expect(item).toHaveProperty('owner');
    expect(item).toHaveProperty('typeId');
  });

  it('should respect limit parameter', async () => {
    const res = await agent
      .get('/feed')
      .query({ cityId: 'city-1', ageGroup: 'adults', lat: '55.75', lng: '37.62', limit: 2 })
      .expect(200);

    expect(res.body.items).toHaveLength(2);
    expect(res.body.nextCursor).not.toBeNull();
  });

  it('should paginate with cursor', async () => {
    const page1 = await agent
      .get('/feed')
      .query({ cityId: 'city-1', ageGroup: 'adults', lat: '55.75', lng: '37.62', limit: 2 })
      .expect(200);

    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.nextCursor).not.toBeNull();

    const page2 = await agent
      .get('/feed')
      .query({
        cityId: 'city-1',
        ageGroup: 'adults',
        lat: '55.75',
        lng: '37.62',
        limit: 2,
        cursor: page1.body.nextCursor,
      })
      .expect(200);

    expect(page2.body).toHaveProperty('items');
  });

  it('should return 200 with default limit when not specified', async () => {
    const res = await agent
      .get('/feed')
      .query({ cityId: 'city-1', ageGroup: 'adults', lat: '55.75', lng: '37.62' })
      .expect(200);

    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it('should return empty for ageGroup=children when all items are adults-only', async () => {
    const res = await agent
      .get('/feed')
      .query({ cityId: 'city-1', ageGroup: 'children', lat: '55.75', lng: '37.62' })
      .expect(200);

    expect(res.body.items).toEqual([]);
  });

  it('should default to ageGroup=adults when ageGroup not specified', async () => {
    const res = await agent
      .get('/feed')
      .query({ cityId: 'city-1', lat: '55.75', lng: '37.62' })
      .expect(200);

    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('should return empty for coordinates far from seeded items', async () => {
    // Tokyo coordinates — far from Moscow (55.75, 37.62), different H3 cell at res 3
    const res = await agent
      .get('/feed')
      .query({ cityId: 'city-1', ageGroup: 'adults', lat: '35.68', lng: '139.69' })
      .expect(200);

    expect(res.body.items).toEqual([]);
  });

  it('should return empty items when cursor points beyond available data', async () => {
    const res = await agent
      .get('/feed')
      .query({ cityId: 'city-1', ageGroup: 'adults', lat: '55.75', lng: '37.62', cursor: '999' })
      .expect(200);

    expect(res.body.items).toEqual([]);
    expect(res.body.nextCursor).toBeNull();
  });

  it('should not return duplicate items across pages', async () => {
    const page1 = await agent
      .get('/feed')
      .query({ cityId: 'city-1', ageGroup: 'adults', lat: '55.75', lng: '37.62', limit: 2 })
      .expect(200);

    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.nextCursor).not.toBeNull();

    const page2 = await agent
      .get('/feed')
      .query({
        cityId: 'city-1',
        ageGroup: 'adults',
        lat: '55.75',
        lng: '37.62',
        limit: 2,
        cursor: page1.body.nextCursor,
      })
      .expect(200);

    const page1Ids = page1.body.items.map((i: { itemId: string }) => i.itemId);
    const page2Ids = page2.body.items.map((i: { itemId: string }) => i.itemId);
    const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
    expect(overlap).toEqual([]);
  });

  it('should handle items deleted from DB but present in Gorse', async () => {
    // Delete one seeded item directly from DB
    const deletedId = seededItemIds[0];
    expectDefined(deletedId);
    await db.delete(discoveryItems).where(eq(discoveryItems.id, deletedId));

    const res = await agent
      .get('/feed')
      .query({ cityId: 'city-1', ageGroup: 'adults', lat: '55.75', lng: '37.62' })
      .expect(200);

    const returnedIds = res.body.items.map((i: { itemId: string }) => i.itemId);
    expect(returnedIds).not.toContain(deletedId);

    // Re-seed the deleted item to not break other tests
    await seedItem(deletedId, { cityId: 'city-1', title: 'Re-seeded Item' });
  });
});

// ─── Возрастные группы ───────────────────────────────────────────

describe('GET /feed (age groups)', { timeout: 300_000 }, () => {
  const childrenItemIds: string[] = [];

  beforeAll(async () => {
    await ensureSeeded();

    // Засидить 3 товара с ageGroup=children
    const ids = await seedItems(3, { titlePrefix: 'Children Item', ageGroup: 'children' });
    childrenItemIds.push(...ids);

    // Отправить interactions от фейковых пользователей для children items
    const fakeUserIds = Array.from({ length: 10 }, () => randomUUID());
    await sendBulkInteractions(fakeUserIds, childrenItemIds, 'view');
    await sendBulkInteractions(fakeUserIds, childrenItemIds, 'like');

    await sleep(5000);

    const feedCategory = userGeoCategory(55.75, 37.62, 'children');
    await waitForGorsePopular(120_000, 2_000, feedCategory);
  }, 240_000);

  it('should return children items when ageGroup=children', async () => {
    const res = await agent
      .get('/feed')
      .query({ cityId: 'city-1', ageGroup: 'children', lat: '55.75', lng: '37.62' })
      .expect(200);

    expect(res.body.items.length).toBeGreaterThan(0);
    const returnedIds = res.body.items.map((i: { itemId: string }) => i.itemId);
    const overlap = childrenItemIds.filter((id) => returnedIds.includes(id));
    expect(overlap.length).toBeGreaterThan(0);
  });
});

// ─── Geo fallback (без координат) ───────────────────────────────

describe('GET /feed (geo fallback)', () => {
  it('should return empty when no coordinates provided and cityId has no known coords', async () => {
    // city-1 не засижен в cmsCities → CityCoordinatesPort вернёт null → global категория
    // В global категории нет popular items → пустой ответ
    const res = await agent
      .get('/feed')
      .query({ cityId: 'city-1', ageGroup: 'adults' })
      .expect(200);

    expect(res.body.items).toEqual([]);
  });

  it('should return empty for completely unknown cityId without coordinates', async () => {
    const res = await agent
      .get('/feed')
      .query({ cityId: 'unknown-city-999', ageGroup: 'adults' })
      .expect(200);

    expect(res.body.items).toEqual([]);
  });
});

// ─── Персонализированные рекомендации (авторизованный пользователь) ──

describe('GET /feed (personalized)', { timeout: 300_000 }, () => {
  let accessToken: string;
  let userId: string;
  const seededItemIds: string[] = [];

  beforeAll(async () => {
    await ensureSeeded();

    // Зарегистрировать пользователя
    const user = await registerUser(agent, FIXED_OTP, { phone: '+79990000099' });
    accessToken = user.accessToken;
    userId = user.userId;

    // Засидить 5 товаров через Kafka
    const ids = await seedItems(5, { titlePrefix: 'Personal Item' });
    seededItemIds.push(...ids);

    // Отправить interactions (лайки) от этого пользователя через Kafka
    await sendBulkInteractions([userId], seededItemIds, 'like');

    // Дать время handler-ам обработать interactions
    await sleep(3000);

    // Поллить /api/recommend/{userId} пока Gorse не сгенерирует рекомендации для нужной гео-категории
    const feedCategory = userGeoCategory(55.75, 37.62, 'adults');
    await waitForGorseRecommendations(userId, 180_000, 2_000, feedCategory);
  }, 240_000);

  it('should return personalized recommendations for authenticated user', async () => {
    // Debug: verify items exist in DB and check Gorse response format
    const dbRows = await db.select().from(discoveryItems);
    console.log(`[personalized] DB has ${dbRows.length} items`);

    const gorseUrl = process.env.GORSE_URL;
    const gorseResp = await fetch(`${gorseUrl}/api/recommend/${userId}?n=10`, {
      headers: { 'X-API-Key': process.env.GORSE_API_KEY! },
    });
    const gorseData = await gorseResp.json();
    console.log(`[personalized] Gorse raw response: ${JSON.stringify(gorseData)}`);

    const res = await agent
      .get('/feed')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ cityId: 'city-1', ageGroup: 'adults', lat: '55.75', lng: '37.62' })
      .expect(200);

    console.log(`[personalized] feed returned ${res.body.items.length} items`);

    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('should return items with correct shape for authenticated user', async () => {
    const res = await agent
      .get('/feed')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ cityId: 'city-1', ageGroup: 'adults', lat: '55.75', lng: '37.62' })
      .expect(200);

    expect(res.body.items.length).toBeGreaterThan(0);
    const item = res.body.items[0];
    expect(item).toHaveProperty('itemId');
    expect(item).toHaveProperty('title');
    expect(item).toHaveProperty('owner');
  });
});

// ─── Geo labels при регистрации / смене города ────────────────────

describe('User geo labels in Gorse', { timeout: 120_000 }, () => {
  beforeAll(async () => {
    await ensureSeeded();
  });

  it('should write h3 labels to Gorse on registration with coordinates', async () => {
    const user = await registerUser(agent, FIXED_OTP, {
      phone: '+79990000050',
      cityId: 'city-msk',
      lat: 55.75,
      lng: 37.62,
    });

    await vi.waitFor(async () => {
      const gorseUser = await gorseGetUser(user.userId);
      expect(gorseUser).not.toBeNull();
      const labels = gorseUser!.Labels;
      expect(labels.some((l: string) => l.startsWith('h3:4:'))).toBe(true);
      expect(labels.some((l: string) => l.startsWith('h3:5:'))).toBe(true);
    }, WAIT_OPTIONS);
  });

  it('should update h3 labels after PATCH /me/profile with new coordinates', async () => {
    const user = await registerUser(agent, FIXED_OTP, {
      phone: '+79990000051',
      cityId: 'city-msk',
      lat: 55.75,
      lng: 37.62,
    });

    // Wait for initial labels
    await vi.waitFor(async () => {
      const gorseUser = await gorseGetUser(user.userId);
      expect(gorseUser).not.toBeNull();
      expect(gorseUser!.Labels.some((l: string) => l.startsWith('h3:4:'))).toBe(true);
    }, WAIT_OPTIONS);

    const initialUser = await gorseGetUser(user.userId);
    const initialLabels = initialUser!.Labels;

    // Update to Saint Petersburg coordinates
    await agent
      .patch('/me/profile')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ fullName: 'Test User', cityId: 'city-spb', lat: 59.93, lng: 30.32 })
      .expect(200);

    // Wait for labels to change
    await vi.waitFor(
      async () => {
        const gorseUser = await gorseGetUser(user.userId);
        expect(gorseUser).not.toBeNull();
        const newLabels = gorseUser!.Labels;
        expect(newLabels.some((l: string) => l.startsWith('h3:4:'))).toBe(true);
        // Labels should differ from initial (different city)
        expect(newLabels).not.toEqual(initialLabels);
      },
      { timeout: 30_000, interval: 500 },
    );
  });

  it('should register without coordinates and have no h3 labels', async () => {
    const user = await registerUser(agent, FIXED_OTP, {
      phone: '+79990000052',
      cityId: 'city-unknown',
    });

    await vi.waitFor(async () => {
      const gorseUser = await gorseGetUser(user.userId);
      expect(gorseUser).not.toBeNull();
      const labels = gorseUser!.Labels ?? [];
      expect(labels.every((l: string) => !l.startsWith('h3:'))).toBe(true);
    }, WAIT_OPTIONS);
  });
});

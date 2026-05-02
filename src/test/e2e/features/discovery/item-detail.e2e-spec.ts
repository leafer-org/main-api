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

const FIXED_OTP = '123456';
const WAIT_OPTIONS = { timeout: 15_000, interval: 500 };

function expectDefined<T>(value: T | undefined): asserts value is T {
  expect(value).toBeDefined();
}

function sleep(t = 100) {
  return new Promise((res) => setTimeout(() => res(undefined), t));
}

describe('discovery-item-detail', () => {
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
      description?: string;
      media?: { type: string; mediaId: string }[];
      cityId?: string;
      lat?: number;
      lng?: number;
      address?: string | null;
      ageGroup?: string;
      paymentStrategy?: string;
      price?: number | null;
      orgId?: string;
      orgName?: string;
      orgAvatarId?: string | null;
      categoryIds?: string[];
      itemRating?: number | null;
      itemReviewCount?: number;
      ownerRating?: number | null;
      ownerReviewCount?: number;
      eventDates?: { date: string; label?: string }[];
      schedule?: { dayOfWeek: number; startTime: string; endTime: string }[];
      typeId?: string;
    },
  ) {
    const typeId = options?.typeId ?? randomUUID();
    const orgId = options?.orgId ?? randomUUID();

    const widgets: unknown[] = [
      {
        type: 'base-info',
        title: options?.title ?? 'Test Item',
        description: options?.description ?? 'Test Description',
        media: options?.media ?? [],
      },
      {
        type: 'owner',
        organizationId: orgId,
        name: options?.orgName ?? 'Test Org',
        avatarId: options?.orgAvatarId ?? null,
      },
    ];

    if (options?.categoryIds) {
      widgets.push({ type: 'category', categoryIds: options.categoryIds, attributes: [] });
    }

    if (options?.cityId || options?.lat !== undefined) {
      widgets.push({
        type: 'location',
        cityId: options?.cityId ?? 'city-1',
        lat: options?.lat ?? 55.75,
        lng: options?.lng ?? 37.62,
        address: options?.address ?? null,
      });
    }

    if (options?.ageGroup) {
      widgets.push({ type: 'age-group', value: options.ageGroup });
    }

    if (options?.paymentStrategy) {
      widgets.push({
        type: 'payment',
        options: [{
          name: 'Оплата',
          description: null,
          strategy: options.paymentStrategy,
          price: options.price ?? null,
        }],
      });
    }

    if (options?.itemRating !== undefined || options?.itemReviewCount !== undefined) {
      widgets.push({
        type: 'item-review',
        rating: options.itemRating ?? null,
        reviewCount: options.itemReviewCount ?? 0,
      });
    }

    if (options?.ownerRating !== undefined || options?.ownerReviewCount !== undefined) {
      widgets.push({
        type: 'owner-review',
        rating: options.ownerRating ?? null,
        reviewCount: options.ownerReviewCount ?? 0,
      });
    }

    if (options?.eventDates) {
      widgets.push({ type: 'event-date-time', dates: options.eventDates });
    }

    if (options?.schedule) {
      widgets.push({ type: 'schedule', entries: options.schedule });
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
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await stopContainers();
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

  describe('GET /items/:itemId', () => {

  // ─── 404 ──────────────────────────────────────────────────────────

  it('возвращает 404 для несуществующего item', async () => {
    const res = await agent.get(`/items/${randomUUID()}`).expect(404);

    expect(res.body).toHaveProperty('type', 'item_not_found');
  });

  // ─── Полный detail view со всеми виджетами ────────────────────────

  it('возвращает детальную карточку со всеми widgets', async () => {
    const itemId = randomUUID();
    const orgId = randomUUID();
    const futureDate = new Date(Date.now() + 86_400_000).toISOString();

    await seedItem(itemId, {
      title: 'Full Item',
      description: 'Full description',
      cityId: 'city-msk',
      lat: 55.75,
      lng: 37.62,
      address: 'ул. Тверская, 1',
      ageGroup: 'adults',
      paymentStrategy: 'one-time',
      price: 1500,
      orgId,
      orgName: 'My Org',
      categoryIds: ['cat-1', 'cat-2'],
      itemRating: 4.5,
      itemReviewCount: 10,
      ownerRating: 4.8,
      ownerReviewCount: 25,
      eventDates: [{ date: futureDate }],
      schedule: [{ dayOfWeek: 1, startTime: '09:00', endTime: '18:00' }],
    });

    const res = await agent.get(`/items/${itemId}`).expect(200);

    expect(res.body).toHaveProperty('itemId', itemId);
    expect(res.body).toHaveProperty('typeId');
    expect(res.body).toHaveProperty('publishedAt');
    expect(res.body.widgets).toBeInstanceOf(Array);

    const widgetTypes = res.body.widgets.map((w: { type: string }) => w.type);
    expect(widgetTypes).toContain('base-info');
    expect(widgetTypes).toContain('owner');
    expect(widgetTypes).toContain('location');
    expect(widgetTypes).toContain('age-group');
    expect(widgetTypes).toContain('payment');
    expect(widgetTypes).toContain('category');
    expect(widgetTypes).toContain('item-review');
    expect(widgetTypes).toContain('owner-review');
    expect(widgetTypes).toContain('event-date-time');
    expect(widgetTypes).toContain('schedule');
  });

  // ─── Минимальный набор виджетов ────────────────────────────────────

  it('возвращает только base-info и owner для минимального item', async () => {
    const itemId = randomUUID();

    await seedItem(itemId, { title: 'Minimal Item' });

    const res = await agent.get(`/items/${itemId}`).expect(200);

    const widgetTypes = res.body.widgets.map((w: { type: string }) => w.type);
    expect(widgetTypes).toContain('base-info');
    expect(widgetTypes).toContain('owner');
    expect(widgetTypes).not.toContain('location');
    expect(widgetTypes).not.toContain('payment');
    expect(widgetTypes).not.toContain('schedule');
    expect(widgetTypes).not.toContain('event-date-time');
  });

  // ─── Корректность данных виджетов ──────────────────────────────────

  it('возвращает корректные данные widgets', async () => {
    const itemId = randomUUID();
    const orgId = randomUUID();

    await seedItem(itemId, {
      title: 'Precise Item',
      description: 'Precise description',
      paymentStrategy: 'one-time',
      price: 2500,
      orgId,
      orgName: 'Precise Org',
      itemRating: 4.7,
      itemReviewCount: 42,
      schedule: [
        { dayOfWeek: 1, startTime: '10:00', endTime: '12:00' },
        { dayOfWeek: 3, startTime: '14:00', endTime: '16:00' },
      ],
    });

    const res = await agent.get(`/items/${itemId}`).expect(200);

    const baseInfo = res.body.widgets.find((w: { type: string }) => w.type === 'base-info');
    expect(baseInfo).toMatchObject({
      type: 'base-info',
      title: 'Precise Item',
      description: 'Precise description',
      media: [],
    });

    const payment = res.body.widgets.find((w: { type: string }) => w.type === 'payment');
    expect(payment).toMatchObject({
      type: 'payment',
      options: [{ name: 'Оплата', description: null, strategy: 'one-time', price: 2500 }],
    });

    const owner = res.body.widgets.find((w: { type: string }) => w.type === 'owner');
    expect(owner).toMatchObject({
      type: 'owner',
      organizationId: orgId,
      name: 'Precise Org',
      avatarId: null,
      avatarUrl: null,
    });

    const itemReview = res.body.widgets.find((w: { type: string }) => w.type === 'item-review');
    expect(itemReview).toMatchObject({
      type: 'item-review',
      rating: 4.7,
      reviewCount: 42,
    });

    const schedule = res.body.widgets.find((w: { type: string }) => w.type === 'schedule');
    expect(schedule.entries).toHaveLength(2);
    expect(schedule.entries[0]).toMatchObject({
      dayOfWeek: 1,
      startTime: '10:00',
      endTime: '12:00',
    });
    expect(schedule.entries[1]).toMatchObject({
      dayOfWeek: 3,
      startTime: '14:00',
      endTime: '16:00',
    });
  });

  // ─── Разные товары — разный набор виджетов ─────────────────────────

  it('возвращает разные наборы widgets для разных items', async () => {
    const eventItemId = randomUUID();
    const scheduleItemId = randomUUID();

    await seedItem(eventItemId, {
      title: 'Event Item',
      eventDates: [{ date: new Date(Date.now() + 86_400_000).toISOString() }],
      paymentStrategy: 'free',
    });

    await seedItem(scheduleItemId, {
      title: 'Schedule Item',
      schedule: [{ dayOfWeek: 5, startTime: '18:00', endTime: '20:00' }],
      cityId: 'city-spb',
      lat: 59.93,
      lng: 30.32,
    });

    const eventRes = await agent.get(`/items/${eventItemId}`).expect(200);
    const scheduleRes = await agent.get(`/items/${scheduleItemId}`).expect(200);

    const eventTypes = eventRes.body.widgets.map((w: { type: string }) => w.type);
    const scheduleTypes = scheduleRes.body.widgets.map((w: { type: string }) => w.type);

    expect(eventTypes).toContain('event-date-time');
    expect(eventTypes).toContain('payment');
    expect(eventTypes).not.toContain('schedule');
    expect(eventTypes).not.toContain('location');

    expect(scheduleTypes).toContain('schedule');
    expect(scheduleTypes).toContain('location');
    expect(scheduleTypes).not.toContain('event-date-time');
    expect(scheduleTypes).not.toContain('payment');
  });
  });
});

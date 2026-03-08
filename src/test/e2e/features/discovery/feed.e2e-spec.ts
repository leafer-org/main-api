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

describe('Discovery Feed HTTP (e2e)', () => {
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
        imageId: null,
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

  // ─── GET /feed ──────────────────────────────────────────────────

  describe('GET /feed', () => {
    it('should return empty list when no items match city', async () => {
      const itemId = randomUUID();
      await seedItem(itemId, { cityId: 'city-2' });

      const res = await agent.get('/feed').query({ cityId: 'city-1' }).expect(200);

      expect(res.body.items).toEqual([]);
      expect(res.body.nextCursor).toBeNull();
    });

    it('should return items matching cityId', async () => {
      const itemId = randomUUID();
      await seedItem(itemId, { cityId: 'city-1' });

      const res = await agent.get('/feed').query({ cityId: 'city-1' }).expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].itemId).toBe(itemId);
    });

    it('should filter by ageGroup', async () => {
      const adultsId = randomUUID();
      const childrenId = randomUUID();
      await seedItem(adultsId, { ageGroup: 'adults' });
      await seedItem(childrenId, { ageGroup: 'children' });

      const res = await agent
        .get('/feed')
        .query({ cityId: 'city-1', ageGroup: 'adults' })
        .expect(200);

      const ids = res.body.items.map((i: { itemId: string }) => i.itemId);
      expect(ids).toContain(adultsId);
      expect(ids).not.toContain(childrenId);
    });

    it('should default ageGroup to adults', async () => {
      const adultsId = randomUUID();
      const childrenId = randomUUID();
      await seedItem(adultsId, { ageGroup: 'adults' });
      await seedItem(childrenId, { ageGroup: 'children' });

      const res = await agent.get('/feed').query({ cityId: 'city-1' }).expect(200);

      const ids = res.body.items.map((i: { itemId: string }) => i.itemId);
      expect(ids).toContain(adultsId);
      expect(ids).not.toContain(childrenId);
    });

    it('should return items with correct shape', async () => {
      const itemId = randomUUID();
      await seedItem(itemId, { title: 'Yoga Class' });

      const res = await agent.get('/feed').query({ cityId: 'city-1' }).expect(200);

      expect(res.body.items).toHaveLength(1);
      const item = res.body.items[0];
      expect(item).toMatchObject({
        itemId,
        title: 'Yoga Class',
        description: 'Desc',
        owner: { name: 'Org' },
        location: { cityId: 'city-1' },
      });
      expect(item).toHaveProperty('typeId');
      expect(item).toHaveProperty('categoryIds');
    });

    it('should respect limit parameter', async () => {
      const id1 = randomUUID();
      const id2 = randomUUID();
      const id3 = randomUUID();
      await seedItem(id1);
      await seedItem(id2);
      await seedItem(id3);

      const res = await agent.get('/feed').query({ cityId: 'city-1', limit: 2 }).expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.nextCursor).not.toBeNull();
    });

    it('should return nextCursor when more items than limit', async () => {
      const id1 = randomUUID();
      const id2 = randomUUID();
      const id3 = randomUUID();
      await seedItem(id1);
      await seedItem(id2);
      await seedItem(id3);

      const page1 = await agent.get('/feed').query({ cityId: 'city-1', limit: 2 }).expect(200);

      expect(page1.body.items).toHaveLength(2);
      expect(page1.body.nextCursor).not.toBeNull();

      // Cursor is accepted and returns 200
      await agent
        .get('/feed')
        .query({ cityId: 'city-1', limit: 2, cursor: page1.body.nextCursor })
        .expect(200);
    });

    it('should return 200 with default limit when not specified', async () => {
      const itemId = randomUUID();
      await seedItem(itemId);

      const res = await agent.get('/feed').query({ cityId: 'city-1' }).expect(200);

      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    });

    it('should return items from new sellers', async () => {
      // All test orgs are "new sellers" (created within 30 days)
      const id1 = randomUUID();
      const id2 = randomUUID();
      await seedItem(id1, { title: 'Item A' });
      await seedItem(id2, { title: 'Item B' });

      const res = await agent.get('/feed').query({ cityId: 'city-1' }).expect(200);

      expect(res.body.items).toHaveLength(2);
      const ids = res.body.items.map((i: { itemId: string }) => i.itemId);
      expect(new Set(ids)).toEqual(new Set([id1, id2]));
    });
  });
});

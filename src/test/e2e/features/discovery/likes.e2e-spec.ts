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
import { waitForAllConsumers } from '../../helpers/kafka.js';
import { createBuckets } from '../../helpers/s3.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { DiscoveryDatabaseClient } from '@/features/discovery/adapters/db/client.js';
import { discoveryItems, discoveryUserLikes } from '@/features/discovery/adapters/db/schema.js';
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

describe('Discovery Likes & Liked Items HTTP (e2e)', () => {
  let app: INestApplication;
  let agent: ReturnType<typeof request>;
  let producer: KafkaProducerService;
  let db: DiscoveryDatabaseClient;

  async function produce<C extends Contract>(contract: C, message: ContractMessage<C>) {
    producer.send(contract, message);
    await producer.flush();
  }

  async function seedItem(itemId: string, title = 'Test Item') {
    const typeId = randomUUID();
    const orgId = randomUUID();

    await produce(itemStreamingContract, {
      id: uuidv7(),
      type: 'item.published',
      itemId,
      typeId,
      organizationId: orgId,
      widgets: [
        { type: 'base-info', title, description: 'Desc', imageId: null },
        { type: 'owner', organizationId: orgId, name: 'Org', avatarId: null },
        { type: 'category', categoryIds: [], attributes: [] },
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

  // ─── POST /items/:itemId/like ──────────────────────────────────

  describe('POST /items/:itemId/like', () => {
    it('should return 401 without auth', async () => {
      await agent.post(`/items/${randomUUID()}/like`).expect(401);
    });

    it('should return 404 for non-existent item', async () => {
      const { accessToken } = await registerUser(agent, FIXED_OTP);

      await agent
        .post(`/items/${randomUUID()}/like`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('should like an item and return 204', async () => {
      const itemId = randomUUID();
      await seedItem(itemId);
      const { accessToken, userId } = await registerUser(agent, FIXED_OTP);

      await agent
        .post(`/items/${itemId}/like`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      const [like] = await db
        .select()
        .from(discoveryUserLikes)
        .where(eq(discoveryUserLikes.itemId, itemId));
      expectDefined(like);
      expect(like.userId).toBe(userId);
    });

    it('should be idempotent — liking twice returns 204', async () => {
      const itemId = randomUUID();
      await seedItem(itemId);
      const { accessToken } = await registerUser(agent, FIXED_OTP);

      await agent
        .post(`/items/${itemId}/like`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      await agent
        .post(`/items/${itemId}/like`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });
  });

  // ─── DELETE /items/:itemId/like ─────────────────────────────────

  describe('DELETE /items/:itemId/like', () => {
    it('should return 401 without auth', async () => {
      await agent.delete(`/items/${randomUUID()}/like`).expect(401);
    });

    it('should unlike an item and return 204', async () => {
      const itemId = randomUUID();
      await seedItem(itemId);
      const { accessToken } = await registerUser(agent, FIXED_OTP);

      await agent
        .post(`/items/${itemId}/like`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      await agent
        .delete(`/items/${itemId}/like`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      const likes = await db
        .select()
        .from(discoveryUserLikes)
        .where(eq(discoveryUserLikes.itemId, itemId));
      expect(likes).toHaveLength(0);
    });

    it('should return 204 even if item was not liked', async () => {
      const { accessToken } = await registerUser(agent, FIXED_OTP);

      await agent
        .delete(`/items/${randomUUID()}/like`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });
  });

  // ─── GET /liked-items ──────────────────────────────────────────

  describe('GET /liked-items', () => {
    it('should return 401 without auth', async () => {
      await agent.get('/liked-items').expect(401);
    });

    it('should return empty list when no likes', async () => {
      const { accessToken } = await registerUser(agent, FIXED_OTP);

      const res = await agent
        .get('/liked-items')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.items).toEqual([]);
      expect(res.body.nextCursor).toBeNull();
    });

    it('should return liked items with likedAt as ISO string', async () => {
      const itemId = randomUUID();
      await seedItem(itemId);
      const { accessToken } = await registerUser(agent, FIXED_OTP);

      await agent
        .post(`/items/${itemId}/like`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      const res = await agent
        .get('/liked-items')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].itemId).toBe(itemId);
      expect(typeof res.body.items[0].likedAt).toBe('string');
    });

    it('should not return unliked items', async () => {
      const itemId = randomUUID();
      await seedItem(itemId);
      const { accessToken } = await registerUser(agent, FIXED_OTP);

      await agent
        .post(`/items/${itemId}/like`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      await agent
        .delete(`/items/${itemId}/like`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      const res = await agent
        .get('/liked-items')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(0);
    });

    it('should respect limit query param', async () => {
      const item1 = randomUUID();
      const item2 = randomUUID();
      await seedItem(item1);
      await seedItem(item2);
      const { accessToken } = await registerUser(agent, FIXED_OTP);

      await agent
        .post(`/items/${item1}/like`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      await agent
        .post(`/items/${item2}/like`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      const res = await agent
        .get('/liked-items')
        .query({ limit: 1 })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.nextCursor).not.toBeNull();
    });

    it('should paginate through all liked items using cursor', async () => {
      const id1 = randomUUID();
      const id2 = randomUUID();
      const id3 = randomUUID();
      const itemIds = [id1, id2, id3];

      await seedItem(id1);
      await seedItem(id2);
      await seedItem(id3);
      const { accessToken } = await registerUser(agent, FIXED_OTP);

      await agent
        .post(`/items/${id1}/like`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
      await sleep(50);
      await agent
        .post(`/items/${id2}/like`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
      await sleep(50);
      await agent
        .post(`/items/${id3}/like`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // First page
      const page1 = await agent
        .get('/liked-items')
        .query({ limit: 2 })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(page1.body.items).toHaveLength(2);
      expect(page1.body.nextCursor).not.toBeNull();

      // Second page using cursor
      const page2 = await agent
        .get('/liked-items')
        .query({ limit: 2, cursor: page1.body.nextCursor })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(page2.body.items).toHaveLength(1);
      expect(page2.body.nextCursor).toBeNull();

      // All items are unique across pages
      const allIds = [...page1.body.items, ...page2.body.items].map(
        (i: { itemId: string }) => i.itemId,
      );
      expect(new Set(allIds).size).toBe(3);
      expect(new Set(allIds)).toEqual(new Set(itemIds));
    });

    it('should paginate with search filter applied', async () => {
      const id1 = randomUUID();
      const id2 = randomUUID();
      const id3 = randomUUID();
      const id4 = randomUUID();

      await seedItem(id1, 'Yoga class');
      await seedItem(id2, 'Yoga retreat');
      await seedItem(id3, 'Cooking class');
      await seedItem(id4, 'Yoga workshop');
      const { accessToken } = await registerUser(agent, FIXED_OTP);

      await agent
        .post(`/items/${id1}/like`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
      await sleep(50);
      await agent
        .post(`/items/${id2}/like`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
      await sleep(50);
      await agent
        .post(`/items/${id3}/like`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
      await sleep(50);
      await agent
        .post(`/items/${id4}/like`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      // First page — search "Yoga", limit 2
      const page1 = await agent
        .get('/liked-items')
        .query({ search: 'Yoga', limit: 2 })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(page1.body.items).toHaveLength(2);
      expect(page1.body.nextCursor).not.toBeNull();
      for (const item of page1.body.items) {
        expect(item.title.toLowerCase()).toContain('yoga');
      }

      // Second page using cursor + same search
      const page2 = await agent
        .get('/liked-items')
        .query({ search: 'Yoga', limit: 2, cursor: page1.body.nextCursor })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(page2.body.items).toHaveLength(1);
      expect(page2.body.nextCursor).toBeNull();
      expect(page2.body.items[0].title.toLowerCase()).toContain('yoga');

      // All returned items are yoga-related, no duplicates
      const allIds = [...page1.body.items, ...page2.body.items].map(
        (i: { itemId: string }) => i.itemId,
      );
      expect(new Set(allIds).size).toBe(3);
      expect(new Set(allIds)).toEqual(new Set([id1, id2, id4]));
    });
  });
});

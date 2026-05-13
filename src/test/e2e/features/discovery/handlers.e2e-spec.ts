import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { startContainers, stopContainers } from '../../helpers/containers.js';
import { runMigrations, seedAdminUser, seedStaticRoles, truncateAll } from '../../helpers/db.js';
import {
  seedItemPublished,
  seedOrganizationPublished,
  unpublishItem,
  unpublishOrganization,
} from '../../helpers/organization-seed.js';
import { waitForAllConsumers } from '../../helpers/kafka.js';
import { createBuckets } from '../../helpers/s3.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { DiscoveryDatabaseClient } from '@/features/discovery/adapters/db/client.js';
import { discoveryItems, discoveryOwners } from '@/features/discovery/adapters/db/schema.js';
import { GorseSyncStub } from '@/features/discovery/adapters/gorse/gorse-sync.stub.js';
import { RecommendationStub } from '@/features/discovery/adapters/gorse/recommendation.stub.js';
import { RecommendationService } from '@/features/discovery/application/ports.js';
import { GorseSyncPort, MeilisearchSyncPort } from '@/features/discovery/application/sync-ports.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';
import { itemStreamingContract } from '@/infra/kafka-contracts/item.contract.js';
import { organizationStreamingContract } from '@/infra/kafka-contracts/organization.contract.js';
import { reviewStreamingContract } from '@/infra/kafka-contracts/review.contract.js';
import type { Contract, ContractMessage } from '@/infra/lib/nest-kafka/contract/contract.js';
import { KafkaProducerService } from '@/infra/lib/nest-kafka/producer/kafka-producer.service.js';

const FIXED_OTP = '123456';
const WAIT_OPTIONS = { timeout: 15_000, interval: 500 };

function expectDefined<T>(value: T | undefined): asserts value is T {
  expect(value).toBeDefined();
}

type AnyWidget = Record<string, unknown>;

describe('discovery-handlers', () => {
  let app: INestApplication;
  let producer: KafkaProducerService;
  let db: DiscoveryDatabaseClient;

  async function produce<C extends Contract>(contract: C, message: ContractMessage<C>) {
    producer.send(contract, message);
    await producer.flush();
  }

  async function publishItem(itemId: string, typeId: string, orgId: string, widgets: AnyWidget[]) {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await seedItemPublished(process.env.DB_URL, {
      id: itemId,
      organizationId: orgId,
      typeId,
      widgets: widgets as unknown[],
    });
    await produce(itemStreamingContract, {
      id: uuidv7(),
      type: 'item.changed',
      itemId,
      changedAt: new Date().toISOString(),
    });
  }

  async function publishOrganization(
    orgId: string,
    info: { name: string; avatarId?: string | null; description?: string },
  ) {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await seedOrganizationPublished(process.env.DB_URL, {
      id: orgId,
      name: info.name,
      avatarId: info.avatarId ?? null,
      description: info.description ?? '',
      published: true,
    });
    await produce(organizationStreamingContract, {
      id: uuidv7(),
      type: 'organization.changed',
      organizationId: orgId,
      changedAt: new Date().toISOString(),
    });
  }

  async function unpublishOrganizationEvent(orgId: string) {
    if (!process.env.DB_URL) throw new Error('DB_URL not set');
    await unpublishOrganization(process.env.DB_URL, orgId);
    await produce(organizationStreamingContract, {
      id: uuidv7(),
      type: 'organization.changed',
      organizationId: orgId,
      changedAt: new Date().toISOString(),
    });
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
      .overrideProvider(MeilisearchSyncPort)
      .useValue({
        upsertItem: async () => {},
        deleteItem: async () => {},
        upsertItems: async () => {},
      })
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    await waitForAllConsumers(app);
    await sleep(100);
    producer = app.get(KafkaProducerService);
    db = app.get(DiscoveryDatabaseClient);
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

  // ─── Owner projection ──────────────────────────────────────────────

  function sleep(t = 1000) {
    return new Promise((res) => setTimeout(() => res(undefined), t));
  }

  describe('Owner projection', () => {
    it('проецирует organization.published в discovery_owners', async () => {
      const orgId = randomUUID();

      await publishOrganization(orgId, { name: 'Test Organization', avatarId: null });

      await vi.waitFor(async () => {
        const [row] = await db.select().from(discoveryOwners).where(eq(discoveryOwners.id, orgId));
        expectDefined(row);
        expect(row.name).toBe('Test Organization');
        expect(row.avatarId).toBeNull();
        expect(row.rating).toBeNull();
        expect(row.reviewCount).toBe(0);
      }, WAIT_OPTIONS);
    });

    it('обновляет owner и каскадно items при republish', async () => {
      const orgId = randomUUID();
      const itemId = randomUUID();
      const typeId = randomUUID();

      await publishOrganization(orgId, { name: 'Original Name', avatarId: null });

      await vi.waitFor(async () => {
        const [row] = await db.select().from(discoveryOwners).where(eq(discoveryOwners.id, orgId));
        expectDefined(row);
      }, WAIT_OPTIONS);

      await publishItem(itemId, typeId, orgId, [
        { type: 'base-info', title: 'Test Item', description: 'Desc', media: [] },
        { type: 'owner', organizationId: orgId, name: 'Original Name', avatarId: null },
      ]);

      await vi.waitFor(async () => {
        const [row] = await db.select().from(discoveryItems).where(eq(discoveryItems.id, itemId));
        expectDefined(row);
      }, WAIT_OPTIONS);

      await publishOrganization(orgId, { name: 'Updated Name', avatarId: 'new-avatar-id' });

      await vi.waitFor(async () => {
        const [owner] = await db
          .select()
          .from(discoveryOwners)
          .where(eq(discoveryOwners.id, orgId));
        expectDefined(owner);
        expect(owner.name).toBe('Updated Name');
        expect(owner.avatarId).toBe('new-avatar-id');

        const [item] = await db.select().from(discoveryItems).where(eq(discoveryItems.id, itemId));
        expectDefined(item);
        expect(item.ownerName).toBe('Updated Name');
        expect(item.ownerAvatarId).toBe('new-avatar-id');
      }, WAIT_OPTIONS);
    });

    it('удаляет owner и все items при unpublish', async () => {
      const orgId = randomUUID();
      const itemId = randomUUID();
      const typeId = randomUUID();

      await publishOrganization(orgId, { name: 'To Delete', avatarId: null });

      await vi.waitFor(async () => {
        const [row] = await db.select().from(discoveryOwners).where(eq(discoveryOwners.id, orgId));
        expectDefined(row);
      }, WAIT_OPTIONS);

      await publishItem(itemId, typeId, orgId, [
        { type: 'base-info', title: 'Item To Delete', description: 'Desc', media: [] },
        { type: 'owner', organizationId: orgId, name: 'To Delete', avatarId: null },
      ]);

      await vi.waitFor(async () => {
        const [row] = await db.select().from(discoveryItems).where(eq(discoveryItems.id, itemId));
        expectDefined(row);
      }, WAIT_OPTIONS);

      await unpublishOrganizationEvent(orgId);

      await vi.waitFor(async () => {
        const owners = await db.select().from(discoveryOwners).where(eq(discoveryOwners.id, orgId));
        expect(owners).toHaveLength(0);

        const items = await db
          .select()
          .from(discoveryItems)
          .where(eq(discoveryItems.organizationId, orgId));
        expect(items).toHaveLength(0);
      }, WAIT_OPTIONS);
    });
  });

  // ─── Category / ItemType projection ────────────────────────────────
  //
  // Метаданные категорий и item-type'ов больше не проецируются в discovery
  // — читаются на запрос через CategoryDirectoryPort/ItemTypeDirectoryPort
  // (cms write-side). Тонкое событие category.changed/item-type.changed
  // нужно для:
  //   1) обновления Meili-индекса search-suggestions
  //   2) cascade re-sync items в поддереве (для closure в junction)
  //
  // Поведение endpoint'ов проверяется в discovery-categories.e2e-spec.ts
  // и discovery-search-suggestions.e2e-spec.ts.

  // ─── Item projection ──────────────────────────────────────────────

  describe('Item projection', () => {
    it('проецирует item.published в discovery_items с widgets', async () => {
      const itemId = randomUUID();
      const typeId = randomUUID();
      const orgId = randomUUID();

      await publishItem(itemId, typeId, orgId, [
        {
          type: 'base-info',
          title: 'My Service',
          description: 'A great service',
          media: [{ type: 'image', mediaId: 'img-1' }],
        },
        { type: 'location', cityId: 'city-1', lat: 55.75, lng: 37.62, address: 'Moscow' },
        { type: 'payment', options: [{ name: 'Разовая', description: null, strategy: 'one-time', price: 1500 }] },
        { type: 'owner', organizationId: orgId, name: 'Org Name', avatarId: null },
      ]);

      await vi.waitFor(async () => {
        const [row] = await db.select().from(discoveryItems).where(eq(discoveryItems.id, itemId));
        expectDefined(row);
        expect(row.title).toBe('My Service');
        expect(row.description).toBe('A great service');
        expect(row.media).toEqual([{ type: 'image', mediaId: 'img-1' }]);
        expect(row.cityId).toBe('city-1');
        expect(Number(row.lat)).toBeCloseTo(55.75);
        expect(Number(row.lng)).toBeCloseTo(37.62);
        expect(row.address).toBe('Moscow');
        expect(row.paymentOptions).toEqual([{ name: 'Разовая', description: null, strategy: 'one-time', price: 1500 }]);
        expect(Number(row.minPrice)).toBe(1500);
        expect(row.organizationId).toBe(orgId);
        expect(row.ownerName).toBe('Org Name');
      }, WAIT_OPTIONS);
    });

    it('удаляет item при item.unpublished', async () => {
      const itemId = randomUUID();
      const typeId = randomUUID();

      await publishItem(itemId, typeId, randomUUID(), [
        { type: 'base-info', title: 'To Delete', description: '', media: [] },
      ]);

      await vi.waitFor(async () => {
        const [row] = await db.select().from(discoveryItems).where(eq(discoveryItems.id, itemId));
        expectDefined(row);
      }, WAIT_OPTIONS);

      await unpublishItem(process.env.DB_URL!, itemId);
      await produce(itemStreamingContract, {
        id: uuidv7(),
        type: 'item.changed',
        itemId,
        changedAt: new Date().toISOString(),
      });

      await vi.waitFor(async () => {
        const rows = await db.select().from(discoveryItems).where(eq(discoveryItems.id, itemId));
        expect(rows).toHaveLength(0);
      }, WAIT_OPTIONS);
    });
  });

  // ─── Review projection ────────────────────────────────────────────

  describe('Review projection', () => {
    it('обновляет рейтинг item при review.created с target=item', async () => {
      const itemId = randomUUID();
      const typeId = randomUUID();

      await publishItem(itemId, typeId, randomUUID(), [
        { type: 'base-info', title: 'Reviewed Item', description: '', media: [] },
      ]);

      await vi.waitFor(async () => {
        const [row] = await db.select().from(discoveryItems).where(eq(discoveryItems.id, itemId));
        expectDefined(row);
      }, WAIT_OPTIONS);

      await produce(reviewStreamingContract, {
        id: uuidv7(),
        type: 'review.created',
        reviewId: randomUUID(),
        target: { targetType: 'item', itemId },
        newRating: 4.5,
        newReviewCount: 1,
        createdAt: new Date().toISOString(),
      });

      await vi.waitFor(async () => {
        const [row] = await db.select().from(discoveryItems).where(eq(discoveryItems.id, itemId));
        expectDefined(row);
        expect(Number(row.itemRating)).toBeCloseTo(4.5);
        expect(row.itemReviewCount).toBe(1);
      }, WAIT_OPTIONS);
    });

    it('обновляет рейтинг owner при review.created с target=organization', async () => {
      const orgId = randomUUID();
      const itemId = randomUUID();
      const typeId = randomUUID();

      await publishOrganization(orgId, { name: 'Reviewed Org', avatarId: null });

      await vi.waitFor(async () => {
        const [row] = await db.select().from(discoveryOwners).where(eq(discoveryOwners.id, orgId));
        expectDefined(row);
      }, WAIT_OPTIONS);

      await publishItem(itemId, typeId, orgId, [
        { type: 'base-info', title: 'Org Item', description: '', media: [] },
        { type: 'owner', organizationId: orgId, name: 'Reviewed Org', avatarId: null },
      ]);

      await vi.waitFor(async () => {
        const [row] = await db.select().from(discoveryItems).where(eq(discoveryItems.id, itemId));
        expectDefined(row);
      }, WAIT_OPTIONS);

      await produce(reviewStreamingContract, {
        id: uuidv7(),
        type: 'review.created',
        reviewId: randomUUID(),
        target: { targetType: 'organization', organizationId: orgId },
        newRating: 4.0,
        newReviewCount: 3,
        createdAt: new Date().toISOString(),
      });

      await vi.waitFor(async () => {
        const [owner] = await db
          .select()
          .from(discoveryOwners)
          .where(eq(discoveryOwners.id, orgId));
        expectDefined(owner);
        expect(Number(owner.rating)).toBeCloseTo(4.0);
        expect(owner.reviewCount).toBe(3);

        const [item] = await db.select().from(discoveryItems).where(eq(discoveryItems.id, itemId));
        expectDefined(item);
        expect(Number(item.ownerRating)).toBeCloseTo(4.0);
        expect(item.ownerReviewCount).toBe(3);
      }, WAIT_OPTIONS);
    });
  });
});

import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
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
  discoveryOwners,
} from '@/features/discovery/adapters/db/schema.js';
import { GorseSyncStub } from '@/features/discovery/adapters/gorse/gorse-sync.stub.js';
import { RecommendationStub } from '@/features/discovery/adapters/gorse/recommendation.stub.js';
import { RecommendationService } from '@/features/discovery/application/ports.js';
import { GorseSyncPort, MeilisearchSyncPort } from '@/features/discovery/application/sync-ports.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';
import { categoryStreamingContract } from '@/infra/kafka-contracts/category.contract.js';
import { itemStreamingContract } from '@/infra/kafka-contracts/item.contract.js';
import { itemTypeStreamingContract } from '@/infra/kafka-contracts/item-type.contract.js';
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

describe('Discovery Projection Handlers (e2e)', () => {
  let app: INestApplication;
  let producer: KafkaProducerService;
  let db: DiscoveryDatabaseClient;

  async function produce<C extends Contract>(contract: C, message: ContractMessage<C>) {
    producer.send(contract, message);
    await producer.flush();
  }

  function publishItem(itemId: string, typeId: string, orgId: string, widgets: AnyWidget[]) {
    return produce(itemStreamingContract, {
      id: uuidv7(),
      type: 'item.published',
      itemId,
      typeId,
      organizationId: orgId,
      widgets: widgets as any,
      republished: false,
      publishedAt: new Date().toISOString(),
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
    it('should project organization.published into discovery_owners', async () => {
      const orgId = randomUUID();

      await produce(organizationStreamingContract, {
        id: uuidv7(),
        type: 'organization.published',
        organizationId: orgId,
        name: 'Test Organization',
        avatarId: null,
        republished: false,
        publishedAt: new Date().toISOString(),
      });

      await vi.waitFor(async () => {
        const [row] = await db.select().from(discoveryOwners).where(eq(discoveryOwners.id, orgId));
        expectDefined(row);
        expect(row.name).toBe('Test Organization');
        expect(row.avatarId).toBeNull();
        expect(row.rating).toBeNull();
        expect(row.reviewCount).toBe(0);
      }, WAIT_OPTIONS);
    });

    it('should update owner and cascade to items on republish', async () => {
      const orgId = randomUUID();
      const itemId = randomUUID();
      const typeId = randomUUID();

      await produce(organizationStreamingContract, {
        id: uuidv7(),
        type: 'organization.published',
        organizationId: orgId,
        name: 'Original Name',
        avatarId: null,
        republished: false,
        publishedAt: new Date().toISOString(),
      });

      await vi.waitFor(async () => {
        const [row] = await db.select().from(discoveryOwners).where(eq(discoveryOwners.id, orgId));
        expectDefined(row);
      }, WAIT_OPTIONS);

      await publishItem(itemId, typeId, orgId, [
        { type: 'base-info', title: 'Test Item', description: 'Desc', imageId: null },
        { type: 'owner', organizationId: orgId, name: 'Original Name', avatarId: null },
      ]);

      await vi.waitFor(async () => {
        const [row] = await db.select().from(discoveryItems).where(eq(discoveryItems.id, itemId));
        expectDefined(row);
      }, WAIT_OPTIONS);

      await produce(organizationStreamingContract, {
        id: uuidv7(),
        type: 'organization.published',
        organizationId: orgId,
        name: 'Updated Name',
        avatarId: 'new-avatar-id',
        republished: true,
        publishedAt: new Date().toISOString(),
      });

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

    it('should delete owner and all items on unpublish', async () => {
      const orgId = randomUUID();
      const itemId = randomUUID();
      const typeId = randomUUID();

      await produce(organizationStreamingContract, {
        id: uuidv7(),
        type: 'organization.published',
        organizationId: orgId,
        name: 'To Delete',
        avatarId: null,
        republished: false,
        publishedAt: new Date().toISOString(),
      });

      await vi.waitFor(async () => {
        const [row] = await db.select().from(discoveryOwners).where(eq(discoveryOwners.id, orgId));
        expectDefined(row);
      }, WAIT_OPTIONS);

      await publishItem(itemId, typeId, orgId, [
        { type: 'base-info', title: 'Item To Delete', description: 'Desc', imageId: null },
        { type: 'owner', organizationId: orgId, name: 'To Delete', avatarId: null },
      ]);

      await vi.waitFor(async () => {
        const [row] = await db.select().from(discoveryItems).where(eq(discoveryItems.id, itemId));
        expectDefined(row);
      }, WAIT_OPTIONS);

      await produce(organizationStreamingContract, {
        id: uuidv7(),
        type: 'organization.unpublished',
        organizationId: orgId,
        unpublishedAt: new Date().toISOString(),
      });

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

  // ─── Category projection ───────────────────────────────────────────

  describe('Category projection', () => {
    it('should project category.published into discovery_categories with attributes', async () => {
      const categoryId = randomUUID();
      const attrId = randomUUID();

      await produce(categoryStreamingContract, {
        id: uuidv7(),
        type: 'category.published',
        categoryId,
        parentCategoryId: null,
        name: 'Test Category',
        iconId: randomUUID(),
        allowedTypeIds: [randomUUID()],
        ancestorIds: [],
        attributes: [
          {
            attributeId: attrId,
            name: 'Color',
            required: true,
            schema: { type: 'string' },
          },
        ],
        republished: false,
        publishedAt: new Date().toISOString(),
      });

      await vi.waitFor(async () => {
        const [cat] = await db
          .select()
          .from(discoveryCategories)
          .where(eq(discoveryCategories.id, categoryId));
        expectDefined(cat);
        expect(cat.name).toBe('Test Category');
        expect(cat.parentCategoryId).toBeNull();
        expect(cat.attributes).toHaveLength(1);
        expect(cat.attributes[0]).toMatchObject({
          attributeId: attrId,
          name: 'Color',
          required: true,
        });
      }, WAIT_OPTIONS);
    });

    it('should delete category on unpublish', async () => {
      const categoryId = randomUUID();

      await produce(categoryStreamingContract, {
        id: uuidv7(),
        type: 'category.published',
        categoryId,
        parentCategoryId: null,
        name: 'To Delete',
        iconId: randomUUID(),
        allowedTypeIds: [],
        ancestorIds: [],
        attributes: [
          { attributeId: randomUUID(), name: 'Attr', required: false, schema: { type: 'string' } },
        ],
        republished: false,
        publishedAt: new Date().toISOString(),
      });

      await vi.waitFor(async () => {
        const [cat] = await db
          .select()
          .from(discoveryCategories)
          .where(eq(discoveryCategories.id, categoryId));
        expectDefined(cat);
      }, WAIT_OPTIONS);

      await produce(categoryStreamingContract, {
        id: uuidv7(),
        type: 'category.unpublished',
        categoryId,
        unpublishedAt: new Date().toISOString(),
      });

      await vi.waitFor(async () => {
        const cats = await db
          .select()
          .from(discoveryCategories)
          .where(eq(discoveryCategories.id, categoryId));
        expect(cats).toHaveLength(0);
      }, WAIT_OPTIONS);
    });
  });

  // ─── Item Type projection ─────────────────────────────────────────

  describe('Item Type projection', () => {
    it('should project item-type.created into discovery_item_types', async () => {
      const typeId = randomUUID();

      await produce(itemTypeStreamingContract, {
        id: uuidv7(),
        type: 'item-type.created',
        typeId,
        name: 'Service',
        availableWidgetTypes: ['base-info', 'location', 'payment'],
        requiredWidgetTypes: ['base-info'],
        createdAt: new Date().toISOString(),
      });

      await vi.waitFor(async () => {
        const [row] = await db
          .select()
          .from(discoveryItemTypes)
          .where(eq(discoveryItemTypes.id, typeId));
        expectDefined(row);
        expect(row.name).toBe('Service');
        expect(row.availableWidgetTypes).toEqual(['base-info', 'location', 'payment']);
        expect(row.requiredWidgetTypes).toEqual(['base-info']);
      }, WAIT_OPTIONS);
    });

    it('should update item type on item-type.updated', async () => {
      const typeId = randomUUID();

      await produce(itemTypeStreamingContract, {
        id: uuidv7(),
        type: 'item-type.created',
        typeId,
        name: 'Original',
        availableWidgetTypes: ['base-info'],
        requiredWidgetTypes: [],
        createdAt: new Date().toISOString(),
      });

      await vi.waitFor(async () => {
        const [row] = await db
          .select()
          .from(discoveryItemTypes)
          .where(eq(discoveryItemTypes.id, typeId));
        expectDefined(row);
      }, WAIT_OPTIONS);

      await produce(itemTypeStreamingContract, {
        id: uuidv7(),
        type: 'item-type.updated',
        typeId,
        name: 'Updated Service',
        availableWidgetTypes: ['base-info', 'payment'],
        requiredWidgetTypes: ['base-info'],
        updatedAt: new Date().toISOString(),
      });

      await vi.waitFor(async () => {
        const [row] = await db
          .select()
          .from(discoveryItemTypes)
          .where(eq(discoveryItemTypes.id, typeId));
        expectDefined(row);
        expect(row.name).toBe('Updated Service');
        expect(row.availableWidgetTypes).toEqual(['base-info', 'payment']);
      }, WAIT_OPTIONS);
    });
  });

  // ─── Item projection ──────────────────────────────────────────────

  describe('Item projection', () => {
    it('should project item.published into discovery_items with widgets', async () => {
      const itemId = randomUUID();
      const typeId = randomUUID();
      const orgId = randomUUID();

      await publishItem(itemId, typeId, orgId, [
        {
          type: 'base-info',
          title: 'My Service',
          description: 'A great service',
          imageId: 'img-1',
        },
        { type: 'location', cityId: 'city-1', lat: 55.75, lng: 37.62, address: 'Moscow' },
        { type: 'payment', strategy: 'one-time', price: 1500 },
        { type: 'owner', organizationId: orgId, name: 'Org Name', avatarId: null },
      ]);

      await vi.waitFor(async () => {
        const [row] = await db.select().from(discoveryItems).where(eq(discoveryItems.id, itemId));
        expectDefined(row);
        expect(row.title).toBe('My Service');
        expect(row.description).toBe('A great service');
        expect(row.imageId).toBe('img-1');
        expect(row.cityId).toBe('city-1');
        expect(Number(row.lat)).toBeCloseTo(55.75);
        expect(Number(row.lng)).toBeCloseTo(37.62);
        expect(row.address).toBe('Moscow');
        expect(row.paymentStrategy).toBe('one-time');
        expect(Number(row.price)).toBe(1500);
        expect(row.organizationId).toBe(orgId);
        expect(row.ownerName).toBe('Org Name');
      }, WAIT_OPTIONS);
    });

    it('should delete item on item.unpublished', async () => {
      const itemId = randomUUID();
      const typeId = randomUUID();

      await publishItem(itemId, typeId, randomUUID(), [
        { type: 'base-info', title: 'To Delete', description: '', imageId: null },
      ]);

      await vi.waitFor(async () => {
        const [row] = await db.select().from(discoveryItems).where(eq(discoveryItems.id, itemId));
        expectDefined(row);
      }, WAIT_OPTIONS);

      await produce(itemStreamingContract, {
        id: uuidv7(),
        type: 'item.unpublished',
        itemId,
        unpublishedAt: new Date().toISOString(),
      });

      await vi.waitFor(async () => {
        const rows = await db.select().from(discoveryItems).where(eq(discoveryItems.id, itemId));
        expect(rows).toHaveLength(0);
      }, WAIT_OPTIONS);
    });
  });

  // ─── Review projection ────────────────────────────────────────────

  describe('Review projection', () => {
    it('should update item rating on review.created with item target', async () => {
      const itemId = randomUUID();
      const typeId = randomUUID();

      await publishItem(itemId, typeId, randomUUID(), [
        { type: 'base-info', title: 'Reviewed Item', description: '', imageId: null },
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

    it('should update owner rating on review.created with organization target', async () => {
      const orgId = randomUUID();
      const itemId = randomUUID();
      const typeId = randomUUID();

      await produce(organizationStreamingContract, {
        id: uuidv7(),
        type: 'organization.published',
        organizationId: orgId,
        name: 'Reviewed Org',
        avatarId: null,
        republished: false,
        publishedAt: new Date().toISOString(),
      });

      await vi.waitFor(async () => {
        const [row] = await db.select().from(discoveryOwners).where(eq(discoveryOwners.id, orgId));
        expectDefined(row);
      }, WAIT_OPTIONS);

      await publishItem(itemId, typeId, orgId, [
        { type: 'base-info', title: 'Org Item', description: '', imageId: null },
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

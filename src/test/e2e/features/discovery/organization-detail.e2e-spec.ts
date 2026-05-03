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
import {
  discoveryItems,
  discoveryOwners,
} from '@/features/discovery/adapters/db/schema.js';
import { GorseSyncStub } from '@/features/discovery/adapters/gorse/gorse-sync.stub.js';
import { RecommendationStub } from '@/features/discovery/adapters/gorse/recommendation.stub.js';
import { RecommendationService } from '@/features/discovery/application/ports.js';
import { GorseSyncPort } from '@/features/discovery/application/sync-ports.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';
import { itemStreamingContract } from '@/infra/kafka-contracts/item.contract.js';
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

describe('discovery-organization-detail', () => {
  let app: INestApplication;
  let agent: ReturnType<typeof request>;
  let producer: KafkaProducerService;
  let db: DiscoveryDatabaseClient;

  async function produce<C extends Contract>(contract: C, message: ContractMessage<C>) {
    producer.send(contract, message);
    await producer.flush();
  }

  async function seedOrganization(
    name: string,
    extras: {
      description?: string;
      contacts?: { type: 'phone' | 'email' | 'link'; value: string; label?: string }[];
      team?: {
        title: string;
        members: { name: string; description?: string; media: { type: string; mediaId: string }[] }[];
      } | null;
      media?: { type: string; mediaId: string }[];
    } = {},
  ): Promise<string> {
    const orgId = randomUUID();
    await produce(organizationStreamingContract, {
      id: uuidv7(),
      type: 'organization.published',
      organizationId: orgId,
      name,
      description: extras.description ?? '',
      avatarId: null,
      media: extras.media ?? [],
      contacts: extras.contacts ?? [],
      team: extras.team ?? null,
      republished: false,
      publishedAt: new Date().toISOString(),
    });
    await vi.waitFor(async () => {
      const [row] = await db.select().from(discoveryOwners).where(eq(discoveryOwners.id, orgId));
      expectDefined(row);
    }, WAIT_OPTIONS);
    return orgId;
  }

  async function seedItem(orgId: string, title: string): Promise<string> {
    const itemId = randomUUID();
    const typeId = randomUUID();
    await produce(itemStreamingContract, {
      id: uuidv7(),
      type: 'item.published',
      itemId,
      typeId,
      organizationId: orgId,
      widgets: [
        { type: 'base-info', title, description: 'Desc', media: [] },
        { type: 'owner', organizationId: orgId, name: 'Org', avatarId: null },
        { type: 'category', categoryIds: [], attributes: [] },
        { type: 'location', cityId: CITY_ID, lat: 55.75, lng: 37.62, address: 'A' },
        { type: 'age-group', value: AgeGroupOption.restore('adults') },
      ],
      republished: false,
      publishedAt: new Date().toISOString(),
    });
    await vi.waitFor(async () => {
      const [row] = await db.select().from(discoveryItems).where(eq(discoveryItems.id, itemId));
      expectDefined(row);
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

  describe('GET /orgs/:orgId', () => {
    it('возвращает профиль и товары организации', async () => {
      const orgId = await seedOrganization('Студия йоги «Прана»', {
        description: 'Уютная студия в центре',
        contacts: [
          { type: 'phone', value: '+79991234567' },
          { type: 'link', value: 'https://prana.ru', label: 'Сайт' },
        ],
        team: {
          title: 'Наша команда',
          members: [
            { name: 'Ольга Сидорова', description: 'Преподаватель', media: [] },
          ],
        },
      });
      const itemA = await seedItem(orgId, 'Йога утром');
      const itemB = await seedItem(orgId, 'Йога вечером');

      const res = await agent.get(`/orgs/${orgId}`).expect(200);

      expect(res.body.profile).toMatchObject({
        organizationId: orgId,
        name: 'Студия йоги «Прана»',
        description: 'Уютная студия в центре',
        reviewCount: 0,
      });
      expect(res.body.profile.contacts).toEqual([
        { type: 'phone', value: '+79991234567', label: null },
        { type: 'link', value: 'https://prana.ru', label: 'Сайт' },
      ]);
      expect(res.body.profile.team).toMatchObject({
        title: 'Наша команда',
        members: [{ name: 'Ольга Сидорова', description: 'Преподаватель' }],
      });
      const itemIds = (res.body.items as { itemId: string }[]).map((i) => i.itemId);
      expect(itemIds).toEqual(expect.arrayContaining([itemA, itemB]));
    });

    it('возвращает 404 для несуществующей организации', async () => {
      const res = await agent.get(`/orgs/${randomUUID()}`).expect(404);
      expect(res.body.type).toBe('organization_not_found');
      expect(res.body.isDomain).toBe(true);
    });

    it('items пустые если у организации нет товаров', async () => {
      const orgId = await seedOrganization('Без товаров');

      const res = await agent.get(`/orgs/${orgId}`).expect(200);

      expect(res.body.profile.organizationId).toBe(orgId);
      expect(res.body.items).toEqual([]);
    });

    it('возвращает пустые опциональные поля по умолчанию', async () => {
      const orgId = await seedOrganization('Минимум');

      const res = await agent.get(`/orgs/${orgId}`).expect(200);

      expect(res.body.profile).toMatchObject({
        description: '',
        media: [],
        contacts: [],
        team: null,
      });
    });
  });
});

import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { uuidv7 } from 'uuidv7';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { registerUser } from '../../actors/auth.js';
import { startContainers, stopContainers } from '../../helpers/containers.js';
import { runMigrations, seedStaticRoles, truncateAll } from '../../helpers/db.js';
import { waitForAllConsumers } from '../../helpers/kafka.js';
import { createBuckets } from '../../helpers/s3.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';
import { InteractionDatabaseClient } from '@/features/interactions/adapters/db/client.js';
import { interactions } from '@/features/interactions/adapters/db/schema.js';
import { likeStreamingContract } from '@/infra/kafka-contracts/like.contract.js';
import { reviewStreamingContract } from '@/infra/kafka-contracts/review.contract.js';
import type { Contract, ContractMessage } from '@/infra/lib/nest-kafka/contract/contract.js';
import { KafkaProducerService } from '@/infra/lib/nest-kafka/producer/kafka-producer.service.js';
import type { ItemId } from '@/kernel/domain/ids.js';

const FIXED_OTP = '123456';
const WAIT_OPTIONS = { timeout: 15_000, interval: 500 };

function sleep(t = 100) {
  return new Promise((res) => setTimeout(() => res(undefined), t));
}

// ─── Shared app state ─────────────────────────────────────────────

let app: INestApplication;
let agent: ReturnType<typeof request>;
let producer: KafkaProducerService;
let interactionDb: InteractionDatabaseClient;
let accessToken: string;
let userId: string;

async function produce<C extends Contract>(contract: C, message: ContractMessage<C>) {
  producer.send(contract, message);
  await producer.flush();
}

async function getInteractionRows(filterUserId: string) {
  return interactionDb.select().from(interactions).where(eq(interactions.userId, filterUserId));
}

// ─── Bootstrap ────────────────────────────────────────────────────

beforeAll(async () => {
  await startContainers();
  if (!process.env.DB_URL) throw new Error('DB_URL not set');
  await runMigrations(process.env.DB_URL);
  await createBuckets();
  await seedStaticRoles(process.env.DB_URL);

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
  interactionDb = app.get(InteractionDatabaseClient);
  agent = request(app.getHttpServer());

  // Register a user for authenticated requests
  const user = await registerUser(agent, FIXED_OTP, { phone: '+79990000080' });
  accessToken = user.accessToken;
  userId = user.userId;
}, 120_000);

afterAll(async () => {
  await app?.close();
  await stopContainers();
});

// ─── HTTP Endpoints ───────────────────────────────────────────────

describe('interactions', () => {
describe('POST /interactions/views', () => {
  it('записывает batch views и возвращает 204', async () => {
    const itemIds: string[] = [randomUUID(), randomUUID(), randomUUID()];

    await agent
      .post('/interactions/views')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ itemIds })
      .expect(204);

    const rows = await getInteractionRows(userId);
    const viewRows = rows.filter((r) => r.type === 'view' && itemIds.includes(r.itemId as ItemId));
    expect(viewRows).toHaveLength(3);
  });

  it('дедуплицирует views — повторный batch за час не создаёт дублей', async () => {
    const itemIds: string[] = [randomUUID(), randomUUID()];

    // Первый запрос
    await agent
      .post('/interactions/views')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ itemIds })
      .expect(204);

    // Повторный запрос с теми же items
    await agent
      .post('/interactions/views')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ itemIds })
      .expect(204);

    const rows = await getInteractionRows(userId);
    const viewRows = rows.filter((r) => r.type === 'view' && itemIds.includes(r.itemId));
    expect(viewRows).toHaveLength(2);
  });

  it('возвращает 401 без авторизации', async () => {
    await agent
      .post('/interactions/views')
      .send({ itemIds: [randomUUID()] })
      .expect(401);
  });
});

describe('POST /interactions/click', () => {
  it('записывает click и возвращает 204', async () => {
    const itemId = randomUUID();

    await agent
      .post('/interactions/click')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ itemId })
      .expect(204);

    const rows = await getInteractionRows(userId);
    const clickRows = rows.filter((r) => r.type === 'click' && r.itemId === itemId);
    expect(clickRows).toHaveLength(1);
  });

  it('возвращает 401 без авторизации', async () => {
    await agent.post('/interactions/click').send({ itemId: randomUUID() }).expect(401);
  });
});

describe('POST /interactions/show-contacts', () => {
  it('записывает show-contacts и возвращает 204', async () => {
    const itemId = randomUUID();

    await agent
      .post('/interactions/show-contacts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ itemId })
      .expect(204);

    const rows = await getInteractionRows(userId);
    const scRows = rows.filter((r) => r.type === 'show-contacts' && r.itemId === itemId);
    expect(scRows).toHaveLength(1);
  });

  it('возвращает 401 без авторизации', async () => {
    await agent.post('/interactions/show-contacts').send({ itemId: randomUUID() }).expect(401);
  });
});

// ─── Kafka Consumers ──────────────────────────────────────────────

describe('like.streaming → interactions', () => {
  it('конвертирует item.liked в like interaction', async () => {
    const itemId = randomUUID();
    const likeUserId = randomUUID();

    await produce(likeStreamingContract, {
      id: uuidv7(),
      type: 'item.liked',
      userId: likeUserId,
      itemId,
      timestamp: new Date().toISOString(),
    } as ContractMessage<typeof likeStreamingContract>);

    await vi.waitFor(async () => {
      const rows = await getInteractionRows(likeUserId);
      const likeRows = rows.filter((r) => r.type === 'like' && r.itemId === itemId);
      expect(likeRows).toHaveLength(1);
    }, WAIT_OPTIONS);
  });

  it('конвертирует item.unliked в unlike interaction', async () => {
    const itemId = randomUUID();
    const unlikeUserId = randomUUID();

    await produce(likeStreamingContract, {
      id: uuidv7(),
      type: 'item.unliked',
      userId: unlikeUserId,
      itemId,
      timestamp: new Date().toISOString(),
    } as ContractMessage<typeof likeStreamingContract>);

    await vi.waitFor(async () => {
      const rows = await getInteractionRows(unlikeUserId);
      const unlikeRows = rows.filter((r) => r.type === 'unlike' && r.itemId === itemId);
      expect(unlikeRows).toHaveLength(1);
    }, WAIT_OPTIONS);
  });
});

describe('review.streaming → interactions', () => {
  it('конвертирует review.created (item target) в review interaction', async () => {
    const itemId = randomUUID();
    const reviewUserId = randomUUID();

    await produce(reviewStreamingContract, {
      id: uuidv7(),
      type: 'review.created',
      reviewId: randomUUID(),
      userId: reviewUserId,
      target: { targetType: 'item', itemId },
      newRating: 4.5,
      newReviewCount: 1,
      createdAt: new Date().toISOString(),
    } as ContractMessage<typeof reviewStreamingContract>);

    await vi.waitFor(async () => {
      const rows = await getInteractionRows(reviewUserId);
      const reviewRows = rows.filter((r) => r.type === 'review' && r.itemId === itemId);
      expect(reviewRows).toHaveLength(1);
    }, WAIT_OPTIONS);
  });

  it('игнорирует review.created с organization target', async () => {
    const orgReviewUserId = randomUUID();

    await produce(reviewStreamingContract, {
      id: uuidv7(),
      type: 'review.created',
      reviewId: randomUUID(),
      userId: orgReviewUserId,
      target: { targetType: 'organization', organizationId: randomUUID() },
      newRating: 4.0,
      newReviewCount: 1,
      createdAt: new Date().toISOString(),
    } as ContractMessage<typeof reviewStreamingContract>);

    // Даём время — если бы обработка произошла, запись появилась бы быстро
    await sleep(3000);

    const rows = await getInteractionRows(orgReviewUserId);
    expect(rows).toHaveLength(0);
  });

  it('игнорирует review.deleted', async () => {
    const deleteReviewUserId = randomUUID();

    await produce(reviewStreamingContract, {
      id: uuidv7(),
      type: 'review.deleted',
      reviewId: randomUUID(),
      userId: deleteReviewUserId,
      target: { targetType: 'item', itemId: randomUUID() },
      newRating: null,
      newReviewCount: 0,
      deletedAt: new Date().toISOString(),
    } as ContractMessage<typeof reviewStreamingContract>);

    await sleep(3000);

    const rows = await getInteractionRows(deleteReviewUserId);
    expect(rows).toHaveLength(0);
  });
});
});

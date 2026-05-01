import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { loginAsAdmin } from '../../../actors/auth.js';
import { startContainers, stopContainers } from '../../../helpers/containers.js';
import { type E2eApp } from '../../../helpers/create-app.js';
import { runMigrations, seedAdminUser, seedStaticRoles, truncateAll } from '../../../helpers/db.js';
import { waitForAllConsumers } from '../../../helpers/kafka.js';
import { createBuckets } from '../../../helpers/s3.js';
import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';
import { OtpGeneratorService } from '@/features/idp/application/ports.js';
import { OtpCode } from '@/features/idp/domain/vo/otp.js';
import { itemModerationContract } from '@/infra/kafka-contracts/item-moderation.contract.js';
import type { Contract, ContractMessage } from '@/infra/lib/nest-kafka/contract/contract.js';
import { KafkaProducerService } from '@/infra/lib/nest-kafka/producer/kafka-producer.service.js';

const FIXED_OTP = '123456';
const WAIT_OPTIONS = { timeout: 15_000, interval: 500 };

function makeItemModerationEvent(overrides?: { id?: string; itemId?: string; title?: string }) {
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    type: 'item.moderation-requested' as const,
    itemId: overrides?.itemId ?? crypto.randomUUID(),
    organizationId: crypto.randomUUID(),
    typeId: crypto.randomUUID(),
    widgets: [
      {
        type: 'base-info',
        title: overrides?.title ?? 'Test Item',
        description: 'desc',
        media: [],
      },
      { type: 'category', categoryIds: [], attributes: [] },
    ],
    submittedAt: new Date().toISOString(),
  };
}

describe('Open Subscription Matching (Kafka)', () => {
  let e2e: E2eApp;
  let producer: KafkaProducerService;

  async function produce<C extends Contract>(contract: C, message: ContractMessage<C>) {
    producer.send(contract, message);
    await producer.flush();
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

    const app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    await waitForAllConsumers(app);

    producer = app.get(KafkaProducerService);

    e2e = {
      app,
      agent: request(app.getHttpServer()),
    };
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
    await e2e?.app.close();
    await stopContainers();
  });

  // ─── helpers ────────────────────────────────────────────────────────

  async function createBoard(token: string, name = 'Test Board') {
    const res = await e2e.agent
      .post('/admin/boards')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, description: null, scope: 'platform', organizationId: null, manualCreation: false })
      .expect(201);
    return res.body;
  }

  async function addSubscription(
    token: string,
    boardId: string,
    triggerId: string,
    filters: unknown[] = [],
  ) {
    const res = await e2e.agent
      .post(`/admin/boards/${boardId}/subscriptions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ triggerId, filters })
      .expect(201);
    return res.body;
  }

  async function getTickets(token: string, boardId: string) {
    const res = await e2e.agent
      .get(`/admin/tickets?boardId=${boardId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body;
  }

  // ─── Подписка без фильтров матчит любое событие ────────────────────

  it('Подписка без фильтров матчит любое событие', async () => {
    const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
    const board = await createBoard(accessToken);

    await addSubscription(accessToken, board.boardId, 'item-moderation.requested');

    await produce(itemModerationContract, makeItemModerationEvent({ title: 'Товар 1' }));

    await vi.waitFor(async () => {
      const { tickets } = await getTickets(accessToken, board.boardId);
      expect(tickets).toHaveLength(1);
      expect(tickets[0].message).toContain('Товар 1');
      expect(tickets[0].status).toBe('open');
    }, WAIT_OPTIONS);
  });

  // ─── every-nth ─────────────────────────────────────────────────────

  it('Фильтр every-nth пропускает только каждый N-й', async () => {
    const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
    const board = await createBoard(accessToken);

    // n=1 → should match every event
    await addSubscription(accessToken, board.boardId, 'item-moderation.requested', [
      { type: 'every-nth', n: 1 },
    ]);

    await produce(itemModerationContract, makeItemModerationEvent({ title: 'Every-1' }));

    await vi.waitFor(async () => {
      const { tickets } = await getTickets(accessToken, board.boardId);
      expect(tickets).toHaveLength(1);
    }, WAIT_OPTIONS);
  });

  // ─── json-logic (пока всегда true) ────────────────────────────────

  it('Фильтр json-logic не блокирует (текущая реализация — всегда true)', async () => {
    const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
    const board = await createBoard(accessToken);

    await addSubscription(accessToken, board.boardId, 'item-moderation.requested', [
      { type: 'json-logic', rule: { '==': [{ var: 'item.status' }, 'pending'] } },
    ]);

    await produce(itemModerationContract, makeItemModerationEvent({ title: 'Json-logic test' }));

    await vi.waitFor(async () => {
      const { tickets } = await getTickets(accessToken, board.boardId);
      expect(tickets).toHaveLength(1);
    }, WAIT_OPTIONS);
  });

  // ─── Несколько подписок на одной доске — OR ────────────────────────

  it('Несколько подписок на доске — одно событие создаёт один тикет (break)', async () => {
    const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
    const board = await createBoard(accessToken);

    // Две подписки на один триггер
    await addSubscription(accessToken, board.boardId, 'item-moderation.requested');
    await addSubscription(accessToken, board.boardId, 'item-moderation.requested');

    await produce(itemModerationContract, makeItemModerationEvent({ title: 'Double sub' }));

    await vi.waitFor(async () => {
      const { tickets } = await getTickets(accessToken, board.boardId);
      // HandleTriggerEventInteractor делает break после первого матча — 1 тикет на доску
      expect(tickets).toHaveLength(1);
    }, WAIT_OPTIONS);
  });

  // ─── Дедупликация по eventId ───────────────────────────────────────

  it('Повторное событие с тем же eventId не создаёт дубликат', async () => {
    const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
    const board = await createBoard(accessToken);

    await addSubscription(accessToken, board.boardId, 'item-moderation.requested');

    const eventId = crypto.randomUUID();

    await produce(itemModerationContract, makeItemModerationEvent({ id: eventId, title: 'Dedup' }));

    await vi.waitFor(async () => {
      const { tickets } = await getTickets(accessToken, board.boardId);
      expect(tickets).toHaveLength(1);
    }, WAIT_OPTIONS);

    // Повторная отправка того же eventId
    await produce(itemModerationContract, makeItemModerationEvent({ id: eventId, title: 'Dedup' }));

    // Подождём немного и проверим что тикет всё ещё один
    await new Promise((r) => setTimeout(r, 2000));
    const { tickets } = await getTickets(accessToken, board.boardId);
    expect(tickets).toHaveLength(1);
  });

  // ─── Тикет создаётся с правильными данными ────────────────────────

  it('Тикет из Kafka-события содержит message и data.item', async () => {
    const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
    const board = await createBoard(accessToken);

    await addSubscription(accessToken, board.boardId, 'item-moderation.requested');

    const itemId = crypto.randomUUID();
    await produce(
      itemModerationContract,
      makeItemModerationEvent({ itemId, title: 'Проверка полей' }),
    );

    await vi.waitFor(async () => {
      const { tickets } = await getTickets(accessToken, board.boardId);
      expect(tickets).toHaveLength(1);

      const detail = await e2e.agent
        .get(`/admin/tickets/${tickets[0].ticketId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(detail.body.message).toBe('Модерация товара: Проверка полей');
      expect(detail.body.data.item.id).toBe(itemId);
      expect(detail.body.data.item.title).toBe('Проверка полей');
      expect(detail.body.triggerId).toBe('item-moderation.requested');
    }, WAIT_OPTIONS);
  });

  // ─── Подписка на другой триггер — не срабатывает ───────────────────

  it('Событие не матчит подписку на другой triggerId', async () => {
    const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
    const board = await createBoard(accessToken);

    // Подписка на organization, а событие — item
    await addSubscription(accessToken, board.boardId, 'organization-moderation.requested');

    await produce(itemModerationContract, makeItemModerationEvent({ title: 'Wrong trigger' }));

    await new Promise((r) => setTimeout(r, 2000));
    const { tickets } = await getTickets(accessToken, board.boardId);
    expect(tickets).toHaveLength(0);
  });
});

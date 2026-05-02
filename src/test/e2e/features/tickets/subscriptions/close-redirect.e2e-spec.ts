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
import { moderationResultsContract } from '@/infra/kafka-contracts/moderation-results.contract.js';
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

describe('board-subscriptions', () => {
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

  async function getTickets(token: string, boardId: string) {
    const res = await e2e.agent
      .get(`/admin/tickets?boardId=${boardId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body;
  }

  async function getTicketDetail(token: string, ticketId: string) {
    const res = await e2e.agent
      .get(`/admin/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body;
  }

  /** Создаёт доску с open-подпиской, отправляет Kafka-событие, ждёт тикет */
  async function createBoardWithTicketViaKafka(token: string, boardName = 'Board') {
    const board = await createBoard(token, boardName);

    // Подписка на открытие тикетов
    await e2e.agent
      .post(`/admin/boards/${board.boardId}/subscriptions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ triggerId: 'item-moderation.requested', filters: [] })
      .expect(201);

    const itemId = crypto.randomUUID();
    const event = makeItemModerationEvent({ itemId, title: `Item on ${boardName}` });

    await produce(itemModerationContract, event);

    // Ждём появления тикета
    let ticketId: string = '';
    await vi.waitFor(async () => {
      const { tickets } = await getTickets(token, board.boardId);
      expect(tickets).toHaveLength(1);
      ticketId = tickets[0].ticketId;
    }, WAIT_OPTIONS);

    return { board, itemId, eventId: event.id, ticketId };
  }

  // ─── Таймерные триггеры ────────────────────────────────────────────

  describe('Таймерные триггеры', () => {
    it('timer.since-created — подписка закрытия с таймером', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const board = await createBoard(accessToken);

      const res = await e2e.agent
        .post(`/admin/boards/${board.boardId}/close-subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ triggerId: 'timer.since-created', filters: [], addComment: false })
        .expect(201);

      expect(res.body.closeSubscriptions).toHaveLength(1);
      expect(res.body.closeSubscriptions[0].triggerId).toBe('timer.since-created');
    });

    it('timer.since-status — подписка закрытия с таймером', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const board = await createBoard(accessToken);

      const res = await e2e.agent
        .post(`/admin/boards/${board.boardId}/close-subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ triggerId: 'timer.since-status', filters: [], addComment: false })
        .expect(201);

      expect(res.body.closeSubscriptions).toHaveLength(1);
      expect(res.body.closeSubscriptions[0].triggerId).toBe('timer.since-status');
    });
  });

  // ─── Срабатывание close ────────────────────────────────────────────

  describe('Срабатывание подписки закрытия', () => {
    it('При матче тикет переходит в статус done', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const { board, itemId, ticketId } = await createBoardWithTicketViaKafka(accessToken);

      // Добавляем close-подписку на item-moderation.approved
      await e2e.agent
        .post(`/admin/boards/${board.boardId}/close-subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ triggerId: 'item-moderation.approved', filters: [], addComment: false })
        .expect(201);

      // Отправляем moderation.approved
      await produce(moderationResultsContract, {
        id: crypto.randomUUID(),
        type: 'moderation.approved',
        entityType: 'item',
        entityId: itemId,
      });

      await vi.waitFor(async () => {
        const detail = await getTicketDetail(accessToken, ticketId);
        expect(detail.status).toBe('done');
      }, WAIT_OPTIONS);
    });

    it('Тикет уже в done — повторное закрытие игнорируется', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const { board, itemId, ticketId } = await createBoardWithTicketViaKafka(accessToken);

      await e2e.agent
        .post(`/admin/boards/${board.boardId}/close-subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ triggerId: 'item-moderation.approved', filters: [], addComment: false })
        .expect(201);

      // Первое закрытие
      await produce(moderationResultsContract, {
        id: crypto.randomUUID(),
        type: 'moderation.approved',
        entityType: 'item',
        entityId: itemId,
      });

      await vi.waitFor(async () => {
        const detail = await getTicketDetail(accessToken, ticketId);
        expect(detail.status).toBe('done');
      }, WAIT_OPTIONS);

      // Повторное — не должно выбросить ошибку
      await produce(moderationResultsContract, {
        id: crypto.randomUUID(),
        type: 'moderation.approved',
        entityType: 'item',
        entityId: itemId,
      });

      // Подождём и убедимся что тикет остался done
      await new Promise((r) => setTimeout(r, 2000));
      const detail = await getTicketDetail(accessToken, ticketId);
      expect(detail.status).toBe('done');
    });

    it('addComment=true — комментарий добавляется в историю тикета', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const { board, itemId, ticketId } = await createBoardWithTicketViaKafka(accessToken);

      await e2e.agent
        .post(`/admin/boards/${board.boardId}/close-subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ triggerId: 'item-moderation.rejected', filters: [], addComment: true })
        .expect(201);

      await produce(moderationResultsContract, {
        id: crypto.randomUUID(),
        type: 'moderation.rejected',
        entityType: 'item',
        entityId: itemId,
      });

      await vi.waitFor(async () => {
        const detail = await getTicketDetail(accessToken, ticketId);
        expect(detail.status).toBe('done');
        const comment = detail.history.find((h: { action: string }) => h.action === 'commented');
        expect(comment).toBeDefined();
        expect(comment.data.text).toContain('Модерация: отклонено');
      }, WAIT_OPTIONS);
    });
  });

  // ─── Срабатывание redirect ─────────────────────────────────────────

  describe('Срабатывание подписки перенаправления', () => {
    it('При матче тикет перемещается на targetBoardId со статусом open', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const { board: boardA, itemId, ticketId } = await createBoardWithTicketViaKafka(accessToken, 'Board A');
      const boardB = await createBoard(accessToken, 'Board B');

      // redirect-подписка: при rejected → перенаправить на boardB
      await e2e.agent
        .post(`/admin/boards/${boardA.boardId}/redirect-subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          triggerId: 'item-moderation.rejected',
          filters: [],
          targetBoardId: boardB.boardId,
          addComment: false,
          commentTemplate: '',
        })
        .expect(201);

      await produce(moderationResultsContract, {
        id: crypto.randomUUID(),
        type: 'moderation.rejected',
        entityType: 'item',
        entityId: itemId,
      });

      await vi.waitFor(async () => {
        const detail = await getTicketDetail(accessToken, ticketId);
        expect(detail.boardId).toBe(boardB.boardId);
        expect(detail.status).toBe('open');
      }, WAIT_OPTIONS);
    });

    it('При совпадении нескольких подписок — порядок сохраняется', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const boardA = await createBoard(accessToken, 'Board A');
      const boardB = await createBoard(accessToken, 'Board B');
      const boardC = await createBoard(accessToken, 'Board C');

      await e2e.agent
        .post(`/admin/boards/${boardA.boardId}/redirect-subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          triggerId: 'item-moderation.rejected',
          filters: [],
          targetBoardId: boardB.boardId,
          addComment: false,
          commentTemplate: '',
        })
        .expect(201);

      await e2e.agent
        .post(`/admin/boards/${boardA.boardId}/redirect-subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          triggerId: 'item-moderation.rejected',
          filters: [],
          targetBoardId: boardC.boardId,
          addComment: false,
          commentTemplate: '',
        })
        .expect(201);

      const detail = await e2e.agent
        .get(`/admin/boards/${boardA.boardId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(detail.body.redirectSubscriptions).toHaveLength(2);
      expect(detail.body.redirectSubscriptions[0].targetBoardId).toBe(boardB.boardId);
      expect(detail.body.redirectSubscriptions[1].targetBoardId).toBe(boardC.boardId);
    });

    it('При совпадении нескольких подписок — срабатывает первая по порядку', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const { board: boardA, itemId, ticketId } = await createBoardWithTicketViaKafka(accessToken, 'Board A');
      const boardB = await createBoard(accessToken, 'Board B');
      const boardC = await createBoard(accessToken, 'Board C');

      // Первая подписка → boardB
      await e2e.agent
        .post(`/admin/boards/${boardA.boardId}/redirect-subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          triggerId: 'item-moderation.rejected',
          filters: [],
          targetBoardId: boardB.boardId,
          addComment: false,
          commentTemplate: '',
        })
        .expect(201);

      // Вторая подписка → boardC
      await e2e.agent
        .post(`/admin/boards/${boardA.boardId}/redirect-subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          triggerId: 'item-moderation.rejected',
          filters: [],
          targetBoardId: boardC.boardId,
          addComment: false,
          commentTemplate: '',
        })
        .expect(201);

      await produce(moderationResultsContract, {
        id: crypto.randomUUID(),
        type: 'moderation.rejected',
        entityType: 'item',
        entityId: itemId,
      });

      // Должен уйти на boardB (первая подписка)
      await vi.waitFor(async () => {
        const detail = await getTicketDetail(accessToken, ticketId);
        expect(detail.boardId).toBe(boardB.boardId);
      }, WAIT_OPTIONS);
    });

    it('В истории фиксируется действие moved с fromBoardId и toBoardId', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const { board: boardA, itemId, ticketId } = await createBoardWithTicketViaKafka(accessToken, 'Board A');
      const boardB = await createBoard(accessToken, 'Board B');

      await e2e.agent
        .post(`/admin/boards/${boardA.boardId}/redirect-subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          triggerId: 'item-moderation.approved',
          filters: [],
          targetBoardId: boardB.boardId,
          addComment: false,
          commentTemplate: '',
        })
        .expect(201);

      await produce(moderationResultsContract, {
        id: crypto.randomUUID(),
        type: 'moderation.approved',
        entityType: 'item',
        entityId: itemId,
      });

      await vi.waitFor(async () => {
        const detail = await getTicketDetail(accessToken, ticketId);
        const moved = detail.history.find((h: { action: string }) => h.action === 'moved');
        expect(moved).toBeDefined();
        expect(moved.data.fromBoardId).toBe(boardA.boardId);
        expect(moved.data.toBoardId).toBe(boardB.boardId);
      }, WAIT_OPTIONS);
    });
  });

  // ─── Приоритет ─────────────────────────────────────────────────────

  describe('Приоритет при одновременном матче', () => {
    it('close и redirect подписки сосуществуют на одной доске', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const boardA = await createBoard(accessToken, 'Board A');
      const boardB = await createBoard(accessToken, 'Board B');

      await e2e.agent
        .post(`/admin/boards/${boardA.boardId}/close-subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ triggerId: 'item-moderation.approved', filters: [], addComment: false })
        .expect(201);

      await e2e.agent
        .post(`/admin/boards/${boardA.boardId}/redirect-subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          triggerId: 'item-moderation.approved',
          filters: [],
          targetBoardId: boardB.boardId,
          addComment: false,
          commentTemplate: '',
        })
        .expect(201);

      const detail = await e2e.agent
        .get(`/admin/boards/${boardA.boardId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(detail.body.closeSubscriptions).toHaveLength(1);
      expect(detail.body.redirectSubscriptions).toHaveLength(1);
    });

    it('redirect имеет приоритет над close', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const { board: boardA, itemId, ticketId } = await createBoardWithTicketViaKafka(accessToken, 'Board A');
      const boardB = await createBoard(accessToken, 'Board B');

      // Обе подписки на один триггер
      await e2e.agent
        .post(`/admin/boards/${boardA.boardId}/close-subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ triggerId: 'item-moderation.approved', filters: [], addComment: false })
        .expect(201);

      await e2e.agent
        .post(`/admin/boards/${boardA.boardId}/redirect-subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          triggerId: 'item-moderation.approved',
          filters: [],
          targetBoardId: boardB.boardId,
          addComment: false,
          commentTemplate: '',
        })
        .expect(201);

      await produce(moderationResultsContract, {
        id: crypto.randomUUID(),
        type: 'moderation.approved',
        entityType: 'item',
        entityId: itemId,
      });

      // Тикет должен быть перенаправлен (не закрыт)
      await vi.waitFor(async () => {
        const detail = await getTicketDetail(accessToken, ticketId);
        expect(detail.boardId).toBe(boardB.boardId);
        expect(detail.status).toBe('open');
      }, WAIT_OPTIONS);
    });

    it('Close-подписки не срабатывают на тикет перенаправлённый в этом цикле', async () => {
      const { accessToken } = await loginAsAdmin(e2e.agent, FIXED_OTP);
      const { board: boardA, itemId, ticketId } = await createBoardWithTicketViaKafka(accessToken, 'Board A');
      const boardB = await createBoard(accessToken, 'Board B');

      // close и redirect на один триггер
      await e2e.agent
        .post(`/admin/boards/${boardA.boardId}/close-subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ triggerId: 'item-moderation.rejected', filters: [], addComment: false })
        .expect(201);

      await e2e.agent
        .post(`/admin/boards/${boardA.boardId}/redirect-subscriptions`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          triggerId: 'item-moderation.rejected',
          filters: [],
          targetBoardId: boardB.boardId,
          addComment: false,
          commentTemplate: '',
        })
        .expect(201);

      await produce(moderationResultsContract, {
        id: crypto.randomUUID(),
        type: 'moderation.rejected',
        entityType: 'item',
        entityId: itemId,
      });

      await vi.waitFor(async () => {
        const detail = await getTicketDetail(accessToken, ticketId);
        // Перенаправлен, не закрыт
        expect(detail.boardId).toBe(boardB.boardId);
        expect(detail.status).toBe('open');
        // Нет действия 'done' в истории
        const doneEntry = detail.history.find((h: { action: string }) => h.action === 'done');
        expect(doneEntry).toBeUndefined();
      }, WAIT_OPTIONS);
    });
  });
});

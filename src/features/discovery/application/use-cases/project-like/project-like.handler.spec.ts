import { describe, expect, it } from 'vitest';

import { ServiceMock } from '@/infra/test/mock.js';
import { ItemId, UserId } from '@/kernel/domain/ids.js';

import type { IdempotencyPort, UserLikeProjectionPort } from '../../projection-ports.js';
import { ProjectLikeHandler } from './project-like.handler.js';

const USER_ID = UserId.raw('user-1');
const ITEM_ID = ItemId.raw('item-1');
const TIMESTAMP = new Date('2024-06-01T12:00:00.000Z');
const EVENT_ID = 'event-id-1';

describe('ProjectLikeHandler', () => {
  it('сохраняет лайк при item.liked', async () => {
    const idempotency = ServiceMock<IdempotencyPort>();
    const userLikeProjection = ServiceMock<UserLikeProjectionPort>();
    idempotency.isProcessed.mockResolvedValue(false);

    const handler = new ProjectLikeHandler(idempotency, userLikeProjection);
    await handler.handleItemLiked(EVENT_ID, {
      id: EVENT_ID,
      type: 'item.liked',
      userId: USER_ID,
      itemId: ITEM_ID,
      timestamp: TIMESTAMP,
    });

    expect(userLikeProjection.saveLike).toHaveBeenCalledWith(USER_ID, ITEM_ID, TIMESTAMP);
    expect(idempotency.markProcessed).toHaveBeenCalledWith(EVENT_ID);
  });

  it('удаляет лайк при item.unliked', async () => {
    const idempotency = ServiceMock<IdempotencyPort>();
    const userLikeProjection = ServiceMock<UserLikeProjectionPort>();
    idempotency.isProcessed.mockResolvedValue(false);

    const handler = new ProjectLikeHandler(idempotency, userLikeProjection);
    await handler.handleItemUnliked(EVENT_ID, {
      id: EVENT_ID,
      type: 'item.unliked',
      userId: USER_ID,
      itemId: ITEM_ID,
      timestamp: TIMESTAMP,
    });

    expect(userLikeProjection.removeLike).toHaveBeenCalledWith(USER_ID, ITEM_ID);
    expect(idempotency.markProcessed).toHaveBeenCalledWith(EVENT_ID);
  });

  it('пропускает уже обработанное событие', async () => {
    const idempotency = ServiceMock<IdempotencyPort>();
    const userLikeProjection = ServiceMock<UserLikeProjectionPort>();
    idempotency.isProcessed.mockResolvedValue(true);

    const handler = new ProjectLikeHandler(idempotency, userLikeProjection);
    await handler.handleItemLiked(EVENT_ID, {
      id: EVENT_ID,
      type: 'item.liked',
      userId: USER_ID,
      itemId: ITEM_ID,
      timestamp: TIMESTAMP,
    });

    expect(userLikeProjection.saveLike).not.toHaveBeenCalled();
    expect(idempotency.markProcessed).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';

import { ServiceMock } from '@/infra/test/mock.js';
import { ItemId, UserId } from '@/kernel/domain/ids.js';

import type { IdempotencyPort } from '../../projection-ports.js';
import type { GorseSyncPort } from '../../sync-ports.js';
import { ProjectInteractionHandler } from './project-interaction.handler.js';

const USER_ID = UserId.raw('user-1');
const ITEM_ID = ItemId.raw('item-1');
const TIMESTAMP = new Date('2024-06-01T12:00:00.000Z');
const EVENT_ID = 'event-id-1';

describe('ProjectInteractionHandler', () => {
  it('отправляет feedback в Gorse для view/click/like/purchase/booking', async () => {
    const idempotency = ServiceMock<IdempotencyPort>();
    const gorse = ServiceMock<GorseSyncPort>();
    idempotency.isProcessed.mockResolvedValue(false);

    const handler = new ProjectInteractionHandler(idempotency, gorse);

    for (const interactionType of ['view', 'click', 'like', 'purchase', 'booking'] as const) {
      await handler.handleInteractionRecorded(EVENT_ID, {
        id: EVENT_ID,
        type: 'interaction.recorded',
        userId: USER_ID,
        itemId: ITEM_ID,
        interactionType,
        timestamp: TIMESTAMP,
      });

      expect(gorse.sendFeedback).toHaveBeenCalledWith(USER_ID, ITEM_ID, interactionType, TIMESTAMP);
    }
  });

  it('удаляет feedback из Gorse для unlike', async () => {
    const idempotency = ServiceMock<IdempotencyPort>();
    const gorse = ServiceMock<GorseSyncPort>();
    idempotency.isProcessed.mockResolvedValue(false);

    const handler = new ProjectInteractionHandler(idempotency, gorse);
    await handler.handleInteractionRecorded(EVENT_ID, {
      id: EVENT_ID,
      type: 'interaction.recorded',
      userId: USER_ID,
      itemId: ITEM_ID,
      interactionType: 'unlike',
      timestamp: TIMESTAMP,
    });

    expect(gorse.deleteFeedback).toHaveBeenCalledWith(USER_ID, ITEM_ID, 'like');
    expect(gorse.sendFeedback).not.toHaveBeenCalled();
  });

  it('пропускает уже обработанное событие', async () => {
    const idempotency = ServiceMock<IdempotencyPort>();
    const gorse = ServiceMock<GorseSyncPort>();
    idempotency.isProcessed.mockResolvedValue(true);

    const handler = new ProjectInteractionHandler(idempotency, gorse);
    await handler.handleInteractionRecorded(EVENT_ID, {
      id: EVENT_ID,
      type: 'interaction.recorded',
      userId: USER_ID,
      itemId: ITEM_ID,
      interactionType: 'view',
      timestamp: TIMESTAMP,
    });

    expect(gorse.sendFeedback).not.toHaveBeenCalled();
    expect(gorse.deleteFeedback).not.toHaveBeenCalled();
  });
});

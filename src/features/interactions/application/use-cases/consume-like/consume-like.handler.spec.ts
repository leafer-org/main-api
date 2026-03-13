import { describe, expect, it } from 'vitest';

import { InteractionPublisherPort, InteractionWritePort } from '../../ports.js';
import { ConsumeLikeHandler } from './consume-like.handler.js';
import { ServiceMock } from '@/infra/test/mock.js';
import { ItemId, UserId } from '@/kernel/domain/ids.js';

const USER_ID = UserId.raw('user-1');
const ITEM_ID = ItemId.raw('item-1');
const TIMESTAMP = new Date('2024-06-01T12:00:00.000Z');

const makeDeps = () => {
  const write = ServiceMock<InteractionWritePort>();
  write.insert.mockResolvedValue(undefined);

  const publisher = ServiceMock<InteractionPublisherPort>();

  return { write, publisher };
};

describe('ConsumeLikeHandler', () => {
  it('записывает like interaction при handleLiked', async () => {
    const { write, publisher } = makeDeps();
    const handler = new ConsumeLikeHandler(write, publisher);

    await handler.handleLiked({ userId: USER_ID, itemId: ITEM_ID, timestamp: TIMESTAMP });

    expect(write.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        itemId: ITEM_ID,
        type: 'like',
        timestamp: TIMESTAMP,
      }),
    );
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        itemId: ITEM_ID,
        interactionType: 'like',
        timestamp: TIMESTAMP,
      }),
    );
  });

  it('записывает unlike interaction при handleUnliked', async () => {
    const { write, publisher } = makeDeps();
    const handler = new ConsumeLikeHandler(write, publisher);

    await handler.handleUnliked({ userId: USER_ID, itemId: ITEM_ID, timestamp: TIMESTAMP });

    expect(write.insert).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'unlike' }),
    );
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ interactionType: 'unlike' }),
    );
  });

  it('использует одинаковый id для записи и публикации', async () => {
    const { write, publisher } = makeDeps();
    const handler = new ConsumeLikeHandler(write, publisher);

    await handler.handleLiked({ userId: USER_ID, itemId: ITEM_ID, timestamp: TIMESTAMP });

    const writeId = (write.insert.mock.calls[0]![0] as { id: string }).id;
    const publishId = (publisher.publish.mock.calls[0]![0] as { id: string }).id;
    expect(writeId).toBe(publishId);
  });
});

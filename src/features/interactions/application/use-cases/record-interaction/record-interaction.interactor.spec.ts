import { describe, expect, it } from 'vitest';

import { InteractionPublisherPort, InteractionWritePort } from '../../ports.js';
import { RecordInteractionInteractor } from './record-interaction.interactor.js';
import { Clock } from '@/infra/lib/clock.js';
import { ServiceMock } from '@/infra/test/mock.js';
import { ItemId, UserId } from '@/kernel/domain/ids.js';

const USER_ID = UserId.raw('user-1');
const ITEM_ID = ItemId.raw('item-1');
const NOW = new Date('2024-06-01T12:00:00.000Z');

const makeClock = () => {
  const clock = ServiceMock<Clock>();
  clock.now.mockReturnValue(NOW);
  return clock;
};

const makeDeps = () => {
  const write = ServiceMock<InteractionWritePort>();
  write.insert.mockResolvedValue(undefined);

  const publisher = ServiceMock<InteractionPublisherPort>();

  return { write, publisher };
};

describe('RecordInteractionInteractor', () => {
  it('записывает click и публикует событие', async () => {
    const { write, publisher } = makeDeps();
    const interactor = new RecordInteractionInteractor(makeClock(), write, publisher);

    await interactor.execute({ userId: USER_ID, itemId: ITEM_ID, type: 'click' });

    expect(write.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        itemId: ITEM_ID,
        type: 'click',
        timestamp: NOW,
      }),
    );
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        itemId: ITEM_ID,
        interactionType: 'click',
        timestamp: NOW,
      }),
    );
  });

  it('записывает show-contacts и публикует событие', async () => {
    const { write, publisher } = makeDeps();
    const interactor = new RecordInteractionInteractor(makeClock(), write, publisher);

    await interactor.execute({ userId: USER_ID, itemId: ITEM_ID, type: 'show-contacts' });

    expect(write.insert).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'show-contacts' }),
    );
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ interactionType: 'show-contacts' }),
    );
  });

  it('использует одинаковый id для записи и публикации', async () => {
    const { write, publisher } = makeDeps();
    const interactor = new RecordInteractionInteractor(makeClock(), write, publisher);

    await interactor.execute({ userId: USER_ID, itemId: ITEM_ID, type: 'click' });

    const writeId = (write.insert.mock.calls[0]![0] as { id: string }).id;
    const publishId = (publisher.publish.mock.calls[0]![0] as { id: string }).id;
    expect(writeId).toBe(publishId);
  });
});

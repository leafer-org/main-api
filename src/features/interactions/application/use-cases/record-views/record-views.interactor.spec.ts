import { describe, expect, it } from 'vitest';

import { InteractionDedupPort, InteractionPublisherPort, InteractionWritePort } from '../../ports.js';
import { RecordViewsInteractor } from './record-views.interactor.js';
import { Clock } from '@/infra/lib/clock.js';
import { ServiceMock } from '@/infra/test/mock.js';
import { ItemId, UserId } from '@/kernel/domain/ids.js';

const USER_ID = UserId.raw('user-1');
const ITEM_1 = ItemId.raw('item-1');
const ITEM_2 = ItemId.raw('item-2');
const ITEM_3 = ItemId.raw('item-3');
const NOW = new Date('2024-06-01T12:00:00.000Z');

const makeClock = () => {
  const clock = ServiceMock<Clock>();
  clock.now.mockReturnValue(NOW);
  return clock;
};

const makeDeps = () => {
  const write = ServiceMock<InteractionWritePort>();
  write.insertBatch.mockResolvedValue(undefined);

  const dedup = ServiceMock<InteractionDedupPort>();
  dedup.filterRecentlyViewed.mockResolvedValue([]);

  const publisher = ServiceMock<InteractionPublisherPort>();

  return { write, dedup, publisher };
};

describe('RecordViewsInteractor', () => {
  it('записывает и публикует все items если нет дублей', async () => {
    const { write, dedup, publisher } = makeDeps();
    const interactor = new RecordViewsInteractor(makeClock(), write, dedup, publisher);

    await interactor.execute({ userId: USER_ID, itemIds: [ITEM_1, ITEM_2] });

    expect(dedup.filterRecentlyViewed).toHaveBeenCalledWith(USER_ID, [ITEM_1, ITEM_2], 3_600_000);
    expect(write.insertBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ userId: USER_ID, itemId: ITEM_1, type: 'view', timestamp: NOW }),
        expect.objectContaining({ userId: USER_ID, itemId: ITEM_2, type: 'view', timestamp: NOW }),
      ]),
    );
    expect(publisher.publishBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ userId: USER_ID, itemId: ITEM_1, interactionType: 'view' }),
        expect.objectContaining({ userId: USER_ID, itemId: ITEM_2, interactionType: 'view' }),
      ]),
    );
  });

  it('фильтрует уже просмотренные items за последний час', async () => {
    const { write, dedup, publisher } = makeDeps();
    dedup.filterRecentlyViewed.mockResolvedValue([ITEM_1]);

    const interactor = new RecordViewsInteractor(makeClock(), write, dedup, publisher);

    await interactor.execute({ userId: USER_ID, itemIds: [ITEM_1, ITEM_2, ITEM_3] });

    expect(write.insertBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ itemId: ITEM_2 }),
        expect.objectContaining({ itemId: ITEM_3 }),
      ]),
    );

    const insertedIds = (write.insertBatch.mock.calls[0]![0] as Array<{ itemId: ItemId }>).map(
      (r) => r.itemId,
    );
    expect(insertedIds).not.toContain(ITEM_1);
  });

  it('ничего не делает если все items уже просмотрены', async () => {
    const { write, dedup, publisher } = makeDeps();
    dedup.filterRecentlyViewed.mockResolvedValue([ITEM_1, ITEM_2]);

    const interactor = new RecordViewsInteractor(makeClock(), write, dedup, publisher);

    await interactor.execute({ userId: USER_ID, itemIds: [ITEM_1, ITEM_2] });

    expect(write.insertBatch).not.toHaveBeenCalled();
    expect(publisher.publishBatch).not.toHaveBeenCalled();
  });

  it('генерирует уникальные id для каждой записи', async () => {
    const { write, dedup, publisher } = makeDeps();
    const interactor = new RecordViewsInteractor(makeClock(), write, dedup, publisher);

    await interactor.execute({ userId: USER_ID, itemIds: [ITEM_1, ITEM_2] });

    const rows = write.insertBatch.mock.calls[0]![0] as Array<{ id: string }>;
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

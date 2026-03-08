import type { ItemReadModel } from '../domain/read-models/item.read-model.js';
import type { ItemId, UserId } from '@/kernel/domain/ids.js';

/**
 * Синхронизация items и user feedback в Gorse.
 * Item labels: cityId, ageGroup, categoryIds[], typeId.
 * Веса feedback: view=1, click=2, like=4, purchase/booking=8.
 */
export abstract class GorseSyncPort {
  public abstract upsertItem(item: ItemReadModel): Promise<void>;
  public abstract deleteItem(itemId: ItemId): Promise<void>;
  public abstract sendFeedback(
    userId: UserId,
    itemId: ItemId,
    feedbackType: string,
    timestamp: Date,
  ): Promise<void>;
  public abstract deleteFeedback(
    userId: UserId,
    itemId: ItemId,
    feedbackType: string,
  ): Promise<void>;
}

/** Синхронизация денормализованных данных для полнотекстового поиска. `upsertItems` — batch при обновлении owner. */
export abstract class MeilisearchSyncPort {
  public abstract upsertItem(item: ItemReadModel): Promise<void>;
  public abstract deleteItem(itemId: ItemId): Promise<void>;
  public abstract upsertItems(items: ItemReadModel[]): Promise<void>;
}

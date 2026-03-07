import type { ItemId, UserId } from '@/kernel/domain/ids.js';

import type { ItemReadModel } from '../domain/read-models/item.read-model.js';

export abstract class GorseSyncPort {
  public abstract upsertItem(item: ItemReadModel): Promise<void>;
  public abstract deleteItem(itemId: ItemId): Promise<void>;
  public abstract sendFeedback(
    userId: UserId,
    itemId: ItemId,
    feedbackType: string,
    timestamp: Date,
  ): Promise<void>;
  public abstract deleteFeedback(userId: UserId, itemId: ItemId, feedbackType: string): Promise<void>;
}

export abstract class MeilisearchSyncPort {
  public abstract upsertItem(item: ItemReadModel): Promise<void>;
  public abstract deleteItem(itemId: ItemId): Promise<void>;
  public abstract upsertItems(items: ItemReadModel[]): Promise<void>;
}

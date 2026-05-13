import type { ItemReadModel } from '../domain/read-models/item.read-model.js';
import type {
  CategoryId,
  ItemId,
  OrganizationId,
  TypeId,
  UserId,
} from '@/kernel/domain/ids.js';

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
  public abstract upsertUser(userId: UserId, labels: string[], comment: string): Promise<void>;
  public abstract deleteUser(userId: UserId): Promise<void>;
}

/** Синхронизация денормализованных данных для полнотекстового поиска. `upsertItems` — batch при обновлении owner. */
export abstract class MeilisearchSyncPort {
  public abstract upsertItem(item: ItemReadModel): Promise<void>;
  public abstract deleteItem(itemId: ItemId): Promise<void>;
  public abstract upsertItems(items: ItemReadModel[]): Promise<void>;
}

/**
 * Синхронизация в Meili-индексы для search-suggestions
 * (categories/item-types/owners уже там — см. owner sync-логику).
 * Минимальный документ: { id, name }.
 */
export abstract class CategorySearchSyncPort {
  public abstract upsert(input: { categoryId: CategoryId; name: string }): Promise<void>;
  public abstract delete(categoryId: CategoryId): Promise<void>;
}

export abstract class ItemTypeSearchSyncPort {
  public abstract upsert(input: { typeId: TypeId; name: string }): Promise<void>;
  public abstract delete(typeId: TypeId): Promise<void>;
}

export abstract class OrganizationSearchSyncPort {
  public abstract upsert(input: { organizationId: OrganizationId; name: string }): Promise<void>;
  public abstract delete(organizationId: OrganizationId): Promise<void>;
}

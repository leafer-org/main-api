import type { CategoryReadModel } from '../domain/read-models/category.read-model.js';
import type { ItemReadModel } from '../domain/read-models/item.read-model.js';
import type { ItemTypeReadModel } from '../domain/read-models/item-type.read-model.js';
import type { OwnerReadModel } from '../domain/read-models/owner.read-model.js';
import type { CategoryId, FileId, ItemId, OrganizationId } from '@/kernel/domain/ids.js';

/**
 * Проекция товаров в PG. `updateOwnerData` / `deleteByOrganizationId` возвращают
 * affected IDs для каскадного обновления/удаления в Gorse и Meilisearch.
 */
export abstract class ItemProjectionPort {
  public abstract upsert(item: ItemReadModel): Promise<void>;
  public abstract delete(itemId: ItemId): Promise<void>;
  public abstract deleteByOrganizationId(organizationId: OrganizationId): Promise<ItemId[]>;
  public abstract updateOwnerData(
    organizationId: OrganizationId,
    data: { name: string; avatarId: FileId | null },
  ): Promise<ItemId[]>;
  public abstract updateItemReview(
    itemId: ItemId,
    rating: number | null,
    reviewCount: number,
  ): Promise<void>;
  public abstract updateOwnerReview(
    organizationId: OrganizationId,
    rating: number | null,
    reviewCount: number,
  ): Promise<void>;
  public abstract findItemIdsByCategoryId(categoryId: CategoryId): Promise<ItemId[]>;
}

export abstract class CategoryProjectionPort {
  public abstract upsert(category: CategoryReadModel): Promise<void>;
  public abstract delete(categoryId: CategoryId): Promise<void>;
  public abstract recalcAllCounts(): Promise<void>;
}

export abstract class ItemTypeProjectionPort {
  public abstract upsert(itemType: ItemTypeReadModel): Promise<void>;
}

export abstract class OwnerProjectionPort {
  public abstract upsert(owner: OwnerReadModel): Promise<void>;
  public abstract updateData(
    ownerId: OrganizationId,
    data: { name: string; avatarId: FileId | null; updatedAt: Date },
  ): Promise<void>;
  public abstract updateReview(
    ownerId: OrganizationId,
    rating: number | null,
    reviewCount: number,
  ): Promise<void>;
  public abstract delete(ownerId: OrganizationId): Promise<void>;
}

/** Дедупликация Kafka at-least-once доставки по eventId (таблица processed_events). */
export abstract class IdempotencyPort {
  public abstract isProcessed(eventId: string): Promise<boolean>;
  public abstract markProcessed(eventId: string): Promise<void>;
}

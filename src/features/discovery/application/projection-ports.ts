import type { CategoryId, FileId, ItemId, OrganizationId, UserId } from '@/kernel/domain/ids.js';

import type { AttributeReadModel } from '../domain/read-models/attribute.read-model.js';
import type { CategoryReadModel } from '../domain/read-models/category.read-model.js';
import type { ItemTypeReadModel } from '../domain/read-models/item-type.read-model.js';
import type { ItemReadModel } from '../domain/read-models/item.read-model.js';
import type { OwnerReadModel } from '../domain/read-models/owner.read-model.js';

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
}

export abstract class CategoryProjectionPort {
  public abstract upsert(category: CategoryReadModel): Promise<void>;
  public abstract delete(categoryId: CategoryId): Promise<void>;
}

export abstract class ItemTypeProjectionPort {
  public abstract upsert(itemType: ItemTypeReadModel): Promise<void>;
}

export abstract class OwnerProjectionPort {
  public abstract upsert(owner: OwnerReadModel): Promise<void>;
  public abstract delete(ownerId: OrganizationId): Promise<void>;
}

export abstract class AttributeProjectionPort {
  public abstract upsertBatch(categoryId: CategoryId, attributes: AttributeReadModel[]): Promise<void>;
  public abstract deleteByCategoryId(categoryId: CategoryId): Promise<void>;
}

export abstract class UserLikeProjectionPort {
  public abstract saveLike(userId: UserId, itemId: ItemId, likedAt: Date): Promise<void>;
  public abstract removeLike(userId: UserId, itemId: ItemId): Promise<void>;
}

export abstract class IdempotencyPort {
  public abstract isProcessed(eventId: string): Promise<boolean>;
  public abstract markProcessed(eventId: string): Promise<void>;
}

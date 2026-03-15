import type { CategoryEntity } from '../domain/aggregates/category/entity.js';
import type { ItemTypeEntity } from '../domain/aggregates/item-type/entity.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type {
  CategoryPublishedEvent,
  CategoryUnpublishedEvent,
} from '@/kernel/domain/events/category.events.js';
import type {
  ItemTypeCreatedEvent,
  ItemTypeUpdatedEvent,
} from '@/kernel/domain/events/item-type.events.js';
import type { CategoryId, MediaId, TypeId } from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo/age-group.js';
import type { CategoryAttribute } from '@/kernel/domain/vo/category-attribute.js';

// --- Category repository ---

export abstract class CategoryRepository {
  public abstract findById(tx: Transaction, id: CategoryId): Promise<CategoryEntity | null>;
  public abstract findAncestors(tx: Transaction, id: CategoryId): Promise<CategoryEntity[]>;
  public abstract findDirectChildren(tx: Transaction, id: CategoryId): Promise<CategoryEntity[]>;
  public abstract save(tx: Transaction, state: CategoryEntity): Promise<void>;
}

// --- ItemType repository ---

export abstract class ItemTypeRepository {
  public abstract findById(tx: Transaction, id: TypeId): Promise<ItemTypeEntity | null>;
  public abstract save(tx: Transaction, state: ItemTypeEntity): Promise<void>;
}

// --- Event publisher ports ---

export abstract class CategoryEventPublisher {
  public abstract publishCategoryPublished(
    tx: Transaction,
    event: CategoryPublishedEvent,
  ): Promise<void>;
  public abstract publishCategoryUnpublished(
    tx: Transaction,
    event: CategoryUnpublishedEvent,
  ): Promise<void>;
}

export abstract class ItemTypeEventPublisher {
  public abstract publishItemTypeCreated(
    tx: Transaction,
    event: ItemTypeCreatedEvent,
  ): Promise<void>;
  public abstract publishItemTypeUpdated(
    tx: Transaction,
    event: ItemTypeUpdatedEvent,
  ): Promise<void>;
}

// --- Query ports ---

export type CategoryListItem = {
  id: CategoryId;
  parentCategoryId: CategoryId | null;
  name: string;
  iconId: MediaId;
  allowedTypeIds: TypeId[];
  ageGroups: AgeGroup[];
  status: CategoryEntity['status'];
  attributes: CategoryAttribute[];
};

export abstract class CategoryQueryPort {
  public abstract findAll(): Promise<CategoryListItem[]>;
  public abstract findDetail(id: CategoryId): Promise<CategoryEntity | null>;
}

export type ItemTypeListItem = {
  id: TypeId;
  name: string;
  availableWidgetTypes: ItemTypeEntity['availableWidgetTypes'];
  requiredWidgetTypes: ItemTypeEntity['requiredWidgetTypes'];
};

export abstract class ItemTypeQueryPort {
  public abstract findAll(): Promise<ItemTypeListItem[]>;
}

// --- City query port ---

export type CityListItem = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

export abstract class CityQueryPort {
  public abstract findAll(): Promise<CityListItem[]>;
}

import type { CategoryListReadModel } from '../domain/read-models/category-list.read-model.js';
import type { ItemReadModel } from '../domain/read-models/item.read-model.js';
import type { ItemListView } from '../domain/read-models/item-list-view.read-model.js';
import type { LikedItemView } from '../domain/read-models/liked-item-view.read-model.js';
import type { SearchFacets } from '../domain/read-models/search-result.read-model.js';
import type { CategoryItemFilters, SortOption } from './use-cases/browse-category/types.js';
import type { DynamicSearchFilters } from './use-cases/search/types.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { AttributeId, CategoryId, ItemId, TypeId, UserId } from '@/kernel/domain/ids.js';
import type { AttributeSchema } from '@/kernel/domain/vo/attribute.js';
import type { AgeGroupOption } from '@/kernel/domain/vo/age-group.js';

// --- Query Ports ---

/**
 * Запросы товаров. `findByIds` фильтрует просроченные (next_event_date > now() OR has_schedule).
 */
export abstract class ItemQueryPort {
  public abstract findById(itemId: ItemId): Promise<ItemReadModel | null>;

  public abstract findByIds(ids: ItemId[]): Promise<ItemReadModel[]>;

  public abstract findCategoryItemsSorted(params: {
    categoryId: CategoryId;
    cityId: string;
    ageGroup: AgeGroupOption;
    filters: CategoryItemFilters;
    sort: Exclude<SortOption, 'personal'>;
    includeIds?: ItemId[];
    excludeIds?: ItemId[];
    cursor?: string;
    limit: number;
  }): Promise<{ items: ItemReadModel[]; nextCursor: string | null }>;
}

/** Лайкнутые товары пользователя. Сортировка по likedAt DESC, cursor по likedAt, ILIKE по title. */
export abstract class LikedItemsQueryPort {
  public abstract findLikedItems(params: {
    userId: UserId;
    search?: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: LikedItemView[]; nextCursor: string | null }>;

  /** Проверяет, какие из переданных itemIds лайкнуты пользователем. */
  public abstract checkLikedStatus(userId: UserId, itemIds: ItemId[]): Promise<Set<ItemId>>;
}

export abstract class CategoryListQueryPort {
  public abstract findByParentId(
    parentCategoryId: CategoryId | null,
  ): Promise<CategoryListReadModel[]>;
}

export type CategoryWithAttributes = {
  categoryId: CategoryId;
  allowedTypeIds: TypeId[];
  attributes: {
    attributeId: AttributeId;
    name: string;
    required: boolean;
    schema: AttributeSchema;
  }[];
};

export abstract class CategoryFiltersQueryPort {
  public abstract findById(categoryId: CategoryId): Promise<CategoryWithAttributes | null>;

  public abstract findTypesByIds(typeIds: TypeId[]): Promise<{ typeId: TypeId; name: string }[]>;
}

// --- Lookup Ports ---

/** Резолв ancestorIds для набора категорий. Используется Gorse-адаптером при синке items. */
export abstract class CategoryAncestorLookupPort {
  public abstract findAncestorIds(categoryIds: CategoryId[]): Promise<CategoryId[]>;
  public abstract findRootCategoryIds(categoryIds: CategoryId[]): Promise<CategoryId[]>;
  public abstract clearCache(): void;
}

// --- Write Ports ---

/** Запись лайков пользователя. Используется интеракторами like/unlike. */
export abstract class LikeWritePort {
  public abstract saveLike(
    tx: Transaction,
    userId: UserId,
    itemId: ItemId,
    likedAt: Date,
  ): Promise<void>;
  public abstract removeLike(tx: Transaction, userId: UserId, itemId: ItemId): Promise<void>;
}

// --- Service Ports ---

/** Gorse рекомендации. При недоступности — fallback на базовый скор. */
export abstract class RecommendationService {
  public abstract recommend(params: {
    userId?: UserId;
    category: string;
    offset: number;
    limit: number;
  }): Promise<ItemId[]>;
}

/** Redis кэш ранжированных списков для cursor-пагинации по категориям (TTL ~5 мин). */
export abstract class RankedListCachePort {
  public abstract get(key: string): Promise<ItemId[] | null>;
  public abstract set(key: string, itemIds: ItemId[], ttlMs: number): Promise<void>;
}

/** Meilisearch полнотекстовый поиск с динамическими фасетными фильтрами. */
export abstract class SearchPort {
  public abstract search(params: {
    query: string;
    cityId: string;
    ageGroup: AgeGroupOption;
    filters?: DynamicSearchFilters;
    cursor?: string;
    limit: number;
  }): Promise<{
    items: ItemListView[];
    facets: SearchFacets;
    nextCursor: string | null;
    total: number;
  }>;
}

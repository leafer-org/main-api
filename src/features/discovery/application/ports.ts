import type { CategoryListReadModel } from '../domain/read-models/category-list.read-model.js';
import type { ItemReadModel } from '../domain/read-models/item.read-model.js';
import type { ItemListView } from '../domain/read-models/item-list-view.read-model.js';
import type { LikedItemView } from '../domain/read-models/liked-item-view.read-model.js';
import type { PostRankingCandidate } from '../domain/read-models/post-ranking-candidate.read-model.js';
import type { SearchFacets } from '../domain/read-models/search-result.read-model.js';
import type { CategoryItemFilters, SortOption } from './use-cases/get-category-items/types.js';
import type { DynamicSearchFilters } from './use-cases/search-items/types.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { AttributeId, CategoryId, ItemId, TypeId, UserId } from '@/kernel/domain/ids.js';
import type { AttributeSchema } from '@/kernel/domain/vo/attribute.js';
import type { AgeGroup } from '@/kernel/domain/vo/role.js';

// --- Query Ports ---

/**
 * Top-N кандидатов для категории, отсортированных по базовому скору (свежесть × популярность).
 * Pre-ranking: просроченные events исключены, new seller boost (< 30 дней, затухает линейно).
 */
export abstract class ItemCandidatesPort {
  public abstract findCategoryCandidates(params: {
    categoryId: CategoryId;
    cityId: string;
    ageGroup: AgeGroup;
    filters: CategoryItemFilters;
    cap: number;
  }): Promise<PostRankingCandidate[]>;
}

/** Товары новых продавцов (< 30 дней) для cold start injection в ленту. */
export abstract class NewSellerItemsPort {
  public abstract findNewSellerItems(params: {
    cityId: string;
    ageGroup: AgeGroup;
    limit: number;
  }): Promise<ItemId[]>;
}

/**
 * Запросы товаров. `findByIds` фильтрует просроченные (next_event_date > now() OR has_schedule).
 * `findPopular` — fallback при недоступности Gorse.
 */
export abstract class ItemQueryPort {
  public abstract findByIds(ids: ItemId[]): Promise<ItemReadModel[]>;

  public abstract findCategoryItemsSorted(params: {
    categoryId: CategoryId;
    cityId: string;
    ageGroup: AgeGroup;
    filters: CategoryItemFilters;
    sort: Exclude<SortOption, 'personal'>;
    cursor?: string;
    limit: number;
  }): Promise<{ items: ItemReadModel[]; nextCursor: string | null }>;

  public abstract findPopular(params: {
    cityId: string;
    ageGroup: AgeGroup;
    limit: number;
  }): Promise<ItemReadModel[]>;
}

/** Лайкнутые товары пользователя. Сортировка по likedAt DESC, cursor по likedAt, ILIKE по title. */
export abstract class LikedItemsQueryPort {
  public abstract findLikedItems(params: {
    userId: UserId;
    search?: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: LikedItemView[]; nextCursor: string | null }>;
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
  public abstract findWithAncestors(
    categoryId: CategoryId,
  ): Promise<{ category: CategoryWithAttributes; ancestors: CategoryWithAttributes[] } | null>;

  public abstract findTypesByIds(typeIds: TypeId[]): Promise<{ typeId: TypeId; name: string }[]>;
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

/** Gorse рекомендации (recommend) и ранжирование (rank). При недоступности — fallback на базовый скор. */
export abstract class RecommendationService {
  public abstract recommend(params: {
    userId?: UserId;
    cityId: string;
    ageGroup: AgeGroup;
    offset: number;
    limit: number;
  }): Promise<ItemId[]>;

  public abstract rank(params: { userId?: UserId; itemIds: ItemId[] }): Promise<ItemId[]>;
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
    ageGroup: AgeGroup;
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

import type { CategoryId, ServiceId, UserId } from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo/role.js';

import type { CategoryFiltersReadModel } from '../domain/read-models/category-filters.read-model.js';
import type { CategoryListReadModel } from '../domain/read-models/category-list.read-model.js';
import type { ItemListView } from '../domain/read-models/item-list-view.read-model.js';
import type { ItemReadModel } from '../domain/read-models/item.read-model.js';
import type { LikedItemView } from '../domain/read-models/liked-item-view.read-model.js';
import type { PostRankingCandidate } from '../domain/read-models/post-ranking-candidate.read-model.js';
import type { SearchFacets } from '../domain/read-models/search-result.read-model.js';
import type {
  CategoryItemFilters,
  SortOption,
} from './use-cases/get-category-items/types.js';
import type { DynamicSearchFilters } from './use-cases/search-items/types.js';

// --- Query Ports ---

export abstract class ItemCandidatesPort {
  public abstract findCategoryCandidates(params: {
    categoryId: CategoryId;
    cityId: string;
    ageGroup: AgeGroup;
    filters: CategoryItemFilters;
    cap: number;
  }): Promise<PostRankingCandidate[]>;
}

export abstract class NewSellerItemsPort {
  public abstract findNewSellerItems(params: {
    cityId: string;
    ageGroup: AgeGroup;
    limit: number;
  }): Promise<ServiceId[]>;
}

export abstract class ItemQueryPort {
  public abstract findByIds(ids: ServiceId[]): Promise<ItemReadModel[]>;

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

export abstract class CategoryFiltersQueryPort {
  public abstract findByCategoryId(
    categoryId: CategoryId,
  ): Promise<CategoryFiltersReadModel | null>;
}

// --- Service Ports ---

export abstract class RecommendationService {
  public abstract recommend(params: {
    userId?: UserId;
    cityId: string;
    ageGroup: AgeGroup;
    offset: number;
    limit: number;
  }): Promise<ServiceId[]>;

  public abstract rank(params: {
    userId?: UserId;
    itemIds: ServiceId[];
  }): Promise<ServiceId[]>;
}

export abstract class RankedListCachePort {
  public abstract get(key: string): Promise<ServiceId[] | null>;
  public abstract set(key: string, itemIds: ServiceId[], ttlMs: number): Promise<void>;
}

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

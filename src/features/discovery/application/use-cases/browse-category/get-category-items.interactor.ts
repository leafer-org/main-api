import * as crypto from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';

import { toListView } from '../../../domain/mappers/item-list-view.mapper.js';
import { ItemQueryPort, RankedListCachePort, RecommendationService } from '../../ports.js';
import type { CategoryItemFilters, SortOption } from './types.js';
import { Right } from '@/infra/lib/box.js';
import { nextOffsetCursor, parseOffsetCursor } from '@/infra/lib/pagination/index.js';
import type { CategoryId, ItemId, UserId } from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo/role.js';

const RECOMMEND_CAP = 500;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Товары в категории с фильтрами и сортировкой.
 *
 * sort='personal': Gorse recommend (cap 500) → load items → in-memory filter → Redis cache (5 мин) →
 * cursor-пагинация. При исчерпании кэша — автоматический fallback на sort='newest'.
 *
 * sort≠'personal': прямая SQL cursor-пагинация с сортировкой.
 */
@Injectable()
export class GetCategoryItemsInteractor {
  public constructor(
    @Inject(RecommendationService) private readonly recommendation: RecommendationService,
    @Inject(RankedListCachePort) private readonly rankedListCache: RankedListCachePort,
    @Inject(ItemQueryPort) private readonly itemQuery: ItemQueryPort,
  ) {}

  public async execute(query: {
    userId?: UserId;
    categoryId: CategoryId;
    cityId: string;
    ageGroup: AgeGroup;
    filters: CategoryItemFilters;
    sort: SortOption;
    cursor?: string;
    limit: number;
  }) {
    if (query.sort !== 'personal') {
      const result = await this.itemQuery.findCategoryItemsSorted({
        categoryId: query.categoryId,
        cityId: query.cityId,
        ageGroup: query.ageGroup,
        filters: query.filters,
        sort: query.sort,
        cursor: query.cursor,
        limit: query.limit,
      });
      return Right({
        items: result.items.map(toListView),
        nextCursor: result.nextCursor,
      });
    }

    return this.executePersonalSort(query);
  }

  private async executePersonalSort(query: {
    userId?: UserId;
    categoryId: CategoryId;
    cityId: string;
    ageGroup: AgeGroup;
    filters: CategoryItemFilters;
    cursor?: string;
    limit: number;
  }) {
    const cacheKey = this.buildCacheKey(query);
    const offset = parseOffsetCursor(query.cursor);

    let rankedIds = await this.rankedListCache.get(cacheKey);

    if (!rankedIds) {
      rankedIds = await this.fetchAndRankGorseIds(query);

      if (rankedIds.length === 0) {
        return this.executeSqlFallback(query);
      }

      await this.rankedListCache.set(cacheKey, rankedIds, CACHE_TTL_MS);
    }

    if (offset >= rankedIds.length) {
      return this.executeSqlFallback(query, rankedIds);
    }

    const gorsePageIds = rankedIds.slice(offset, offset + query.limit);
    const remaining = query.limit - gorsePageIds.length;

    if (remaining > 0) {
      const [gorseItems, newestResult] = await Promise.all([
        gorsePageIds.length > 0 ? this.itemQuery.findByIds(gorsePageIds) : Promise.resolve([]),
        this.itemQuery.findCategoryItemsSorted({
          categoryId: query.categoryId,
          cityId: query.cityId,
          ageGroup: query.ageGroup,
          filters: query.filters,
          sort: 'newest',
          excludeIds: rankedIds,
          limit: remaining,
        }),
      ]);

      const itemMap = new Map(gorseItems.map((i) => [i.itemId, i]));
      const orderedGorse = gorsePageIds.map((id) => itemMap.get(id)).filter((i) => i !== undefined);

      return Right({
        items: [...orderedGorse, ...newestResult.items].map(toListView),
        nextCursor: null,
      });
    }

    const items = await this.itemQuery.findByIds(gorsePageIds);
    const itemMap = new Map(items.map((i) => [i.itemId, i]));
    const orderedItems = gorsePageIds.map((id) => itemMap.get(id)).filter((i) => i !== undefined);

    return Right({
      items: orderedItems.map(toListView),
      nextCursor: nextOffsetCursor(offset, orderedItems.length, query.limit, rankedIds.length),
    });
  }

  private async fetchAndRankGorseIds(query: {
    userId?: UserId;
    categoryId: CategoryId;
    cityId: string;
    ageGroup: AgeGroup;
    filters: CategoryItemFilters;
  }): Promise<ItemId[]> {
    const recommendedIds = await this.recommendation
      .recommend({
        userId: query.userId,
        categoryId: query.categoryId,
        cityId: query.cityId,
        ageGroup: query.ageGroup,
        offset: 0,
        limit: RECOMMEND_CAP,
      })
      .catch((): ItemId[] => []);

    if (recommendedIds.length === 0) return [];

    const { items } = await this.itemQuery.findCategoryItemsSorted({
      categoryId: query.categoryId,
      cityId: query.cityId,
      ageGroup: query.ageGroup,
      filters: query.filters,
      sort: 'newest',
      includeIds: recommendedIds,
      limit: RECOMMEND_CAP,
    });

    const idOrder = new Map(recommendedIds.map((id, i) => [String(id), i]));
    items.sort(
      (a, b) => (idOrder.get(String(a.itemId)) ?? 0) - (idOrder.get(String(b.itemId)) ?? 0),
    );

    return items.map((i) => i.itemId);
  }

  private async executeSqlFallback(
    query: {
      categoryId: CategoryId;
      cityId: string;
      ageGroup: AgeGroup;
      filters: CategoryItemFilters;
      cursor?: string;
      limit: number;
    },
    excludeIds?: ItemId[],
  ) {
    const result = await this.itemQuery.findCategoryItemsSorted({
      categoryId: query.categoryId,
      cityId: query.cityId,
      ageGroup: query.ageGroup,
      filters: query.filters,
      sort: 'newest',
      excludeIds,
      cursor: query.cursor,
      limit: query.limit,
    });
    return Right({
      items: result.items.map(toListView),
      nextCursor: result.nextCursor,
    });
  }

  private buildCacheKey(query: {
    userId?: UserId;
    categoryId: CategoryId;
    filters: CategoryItemFilters;
  }): string {
    const raw = JSON.stringify({
      userId: query.userId ?? 'anon',
      categoryId: query.categoryId,
      filters: query.filters,
    });
    return `ranked:${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16)}`;
  }
}

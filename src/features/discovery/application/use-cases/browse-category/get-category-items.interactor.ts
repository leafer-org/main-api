import * as crypto from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';

import { toListView } from '../../../domain/mappers/item-list-view.mapper.js';
import {
  CategoryAncestorLookupPort,
  ItemQueryPort,
  RankedListCachePort,
  RecommendationService,
} from '../../ports.js';
import type { CategoryItemFilters, SortOption } from './types.js';
import { Right } from '@/infra/lib/box.js';
import {
  userGeoCategoryWithCatalog,
  userGlobalCategoryWithCatalog,
} from '@/infra/lib/geo/h3-geo.js';
import { nextOffsetCursor, parseOffsetCursor } from '@/infra/lib/pagination/index.js';
import { CityCoordinatesPort } from '@/kernel/application/ports/city-coordinates.js';
import type { CategoryId, ItemId, UserId } from '@/kernel/domain/ids.js';
import type { AgeGroupOption } from '@/kernel/domain/vo/age-group.js';

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
    @Inject(CityCoordinatesPort) private readonly cityCoordinates: CityCoordinatesPort,
    @Inject(CategoryAncestorLookupPort) private readonly ancestorLookup: CategoryAncestorLookupPort,
  ) {}

  public async execute(query: {
    userId?: UserId;
    categoryId: CategoryId;
    cityId: string;
    coordinates?: { lat: number; lng: number };
    ageGroup: AgeGroupOption;
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
    coordinates?: { lat: number; lng: number };
    ageGroup: AgeGroupOption;
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
    coordinates?: { lat: number; lng: number };
    ageGroup: AgeGroupOption;
    filters: CategoryItemFilters;
  }): Promise<ItemId[]> {
    const category = await this.resolveGeoCategoryWithCatalog(
      query.cityId,
      query.categoryId,
      query.ageGroup,
      query.coordinates,
    );

    const recommendedIds = await this.recommendation
      .recommend({
        userId: query.userId,
        category,
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
      ageGroup: AgeGroupOption;
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
    ageGroup: AgeGroupOption;
    filters: CategoryItemFilters;
  }): string {
    const raw = JSON.stringify({
      userId: query.userId ?? 'anon',
      categoryId: query.categoryId,
      ageGroup: query.ageGroup,
      filters: query.filters,
    });
    return `ranked:${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16)}`;
  }

  private async resolveGeoCategoryWithCatalog(
    cityId: string,
    categoryId: CategoryId,
    ageGroup: AgeGroupOption,
    coordinates?: { lat: number; lng: number },
  ): Promise<string> {
    const rootCatIds = await this.ancestorLookup.findRootCategoryIds([categoryId]);
    const rootCatId = String(rootCatIds[0] ?? categoryId);

    if (coordinates) {
      return userGeoCategoryWithCatalog(coordinates.lat, coordinates.lng, ageGroup, rootCatId);
    }
    const resolved = await this.cityCoordinates.findCoordinates(cityId);
    if (resolved) {
      return userGeoCategoryWithCatalog(resolved.lat, resolved.lng, ageGroup, rootCatId);
    }
    return userGlobalCategoryWithCatalog(ageGroup, rootCatId);
  }
}

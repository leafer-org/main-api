import { Inject, Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';

import { Right } from '@/infra/lib/box.js';
import type { CategoryId, ItemId, UserId } from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo/role.js';

import { toListView } from '../../../domain/mappers/item-list-view.mapper.js';
import { PostRankingService } from '../../../domain/services/post-ranking.service.js';
import {
  ItemCandidatesPort,
  ItemQueryPort,
  RankedListCachePort,
  RecommendationService,
} from '../../ports.js';
import type { CategoryItemFilters, SortOption } from './types.js';

const CANDIDATE_CAP = 500;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Товары в категории с фильтрами и сортировкой.
 *
 * sort='personal': candidates (cap 500) → Gorse rank → PostRanking → Redis cache (5 мин) →
 * cursor-пагинация. При исчерпании кэша — автоматический fallback на sort='newest'.
 *
 * sort≠'personal': прямая SQL cursor-пагинация с сортировкой.
 */
@Injectable()
export class GetCategoryItemsInteractor {
  public constructor(
    @Inject(ItemCandidatesPort) private readonly itemCandidates: ItemCandidatesPort,
    @Inject(RecommendationService) private readonly recommendation: RecommendationService,
    @Inject(RankedListCachePort) private readonly rankedListCache: RankedListCachePort,
    @Inject(ItemQueryPort) private readonly itemQuery: ItemQueryPort,
    @Inject(PostRankingService) private readonly postRanking: PostRankingService,
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
    const offset = query.cursor ? Number.parseInt(query.cursor, 10) : 0;

    let rankedIds = await this.rankedListCache.get(cacheKey);

    if (!rankedIds) {
      const candidates = await this.itemCandidates.findCategoryCandidates({
        categoryId: query.categoryId,
        cityId: query.cityId,
        ageGroup: query.ageGroup,
        filters: query.filters,
        cap: CANDIDATE_CAP,
      });

      const candidateIds = candidates.map((c) => c.itemId);

      const gorseRanked = await this.recommendation
        .rank({ userId: query.userId, itemIds: candidateIds })
        .catch((): ItemId[] => candidateIds);

      const candidateMap = new Map(candidates.map((c) => [c.itemId, c]));
      const reorderedCandidates = gorseRanked
        .map((id) => candidateMap.get(id))
        .filter((c) => c !== undefined);

      const postRanked = this.postRanking.apply(reorderedCandidates);
      rankedIds = postRanked.map((c) => c.itemId);

      await this.rankedListCache.set(cacheKey, rankedIds, CACHE_TTL_MS);
    }

    if (offset >= rankedIds.length) {
      return this.executeSqlFallback(query);
    }

    const pageIds = rankedIds.slice(offset, offset + query.limit);
    const items = await this.itemQuery.findByIds(pageIds);

    const itemMap = new Map(items.map((i) => [i.itemId, i]));
    const orderedItems = pageIds
      .map((id) => itemMap.get(id))
      .filter((i) => i !== undefined);

    const nextOffset = offset + orderedItems.length;
    const nextCursor =
      orderedItems.length === query.limit && nextOffset < rankedIds.length
        ? String(nextOffset)
        : null;

    return Right({
      items: orderedItems.map(toListView),
      nextCursor,
    });
  }

  private async executeSqlFallback(query: {
    categoryId: CategoryId;
    cityId: string;
    ageGroup: AgeGroup;
    filters: CategoryItemFilters;
    cursor?: string;
    limit: number;
  }) {
    const result = await this.itemQuery.findCategoryItemsSorted({
      categoryId: query.categoryId,
      cityId: query.cityId,
      ageGroup: query.ageGroup,
      filters: query.filters,
      sort: 'newest',
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

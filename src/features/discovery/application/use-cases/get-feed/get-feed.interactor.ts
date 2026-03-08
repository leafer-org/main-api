import { Inject, Injectable } from '@nestjs/common';

import { Right } from '@/infra/lib/box.js';
import type { ItemId, UserId } from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo/role.js';

import { toListView } from '../../../domain/mappers/item-list-view.mapper.js';
import { toRankingCandidate } from '../../../domain/mappers/post-ranking-candidate.mapper.js';
import { PostRankingService } from '../../../domain/services/post-ranking.service.js';
import { ItemQueryPort, NewSellerItemsPort, RecommendationService } from '../../ports.js';

/**
 * Персонализированная лента рекомендаций по всему каталогу.
 *
 * Flow: Gorse recommend (×2 запас) ∥ new sellers (5 шт) → merge (dedup) →
 * fallback findPopular при пустом результате → load items → PostRanking → slice limit.
 * Пре-фильтры (город, возраст) задаются как item labels в Gorse.
 */
@Injectable()
export class GetFeedInteractor {
  public constructor(
    @Inject(RecommendationService) private readonly recommendation: RecommendationService,
    @Inject(NewSellerItemsPort) private readonly newSellerItems: NewSellerItemsPort,
    @Inject(ItemQueryPort) private readonly itemQuery: ItemQueryPort,
    @Inject(PostRankingService) private readonly postRanking: PostRankingService,
  ) {}

  // Задать вопрос по стабильности пагинации
  public async execute(query: {
    userId?: UserId;
    cityId: string;
    ageGroup: AgeGroup;
    cursor?: string;
    limit: number;
  }) {
    const offset = query.cursor ? Number.parseInt(query.cursor, 10) : 0;

    const [recommendedIds, newSellerIds] = await Promise.all([
      this.recommendation
        .recommend({
          userId: query.userId,
          cityId: query.cityId,
          ageGroup: query.ageGroup,
          offset,
          limit: query.limit * 2,
        })
        .catch((): ItemId[] => []),
      this.newSellerItems.findNewSellerItems({
        cityId: query.cityId,
        ageGroup: query.ageGroup,
        limit: 5,
      }),
    ]);

    const seen = new Set<ItemId>(recommendedIds);
    const mergedIds = [...recommendedIds];
    for (const id of newSellerIds) {
      if (!seen.has(id)) {
        mergedIds.push(id);
        seen.add(id);
      }
    }

    const candidateIds =
      mergedIds.length > 0
        ? mergedIds
        : await this.itemQuery
            .findPopular({
              cityId: query.cityId,
              ageGroup: query.ageGroup,
              limit: query.limit * 2,
            })
            .then((items) => items.map((i) => i.itemId));

    const items = await this.itemQuery.findByIds(candidateIds);

    const candidates = items.map(toRankingCandidate);
    const ranked = this.postRanking.apply(candidates);

    const rankedMap = new Map(items.map((i) => [i.itemId, i]));
    const orderedItems = ranked
      .map((c) => rankedMap.get(c.itemId))
      .filter((i) => i !== undefined)
      .slice(0, query.limit);

    const nextOffset = offset + orderedItems.length;
    const nextCursor = orderedItems.length === query.limit ? String(nextOffset) : null;

    return Right({
      items: orderedItems.map(toListView),
      nextCursor,
    });
  }
}

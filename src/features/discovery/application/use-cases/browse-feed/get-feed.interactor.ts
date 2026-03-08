import { Inject, Injectable } from '@nestjs/common';

import { toListView } from '../../../domain/mappers/item-list-view.mapper.js';
import { ItemQueryPort, RecommendationService } from '../../ports.js';
import { Right } from '@/infra/lib/box.js';
import { nextOffsetCursor, parseOffsetCursor } from '@/infra/lib/pagination/index.js';
import type { ItemId, UserId } from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo/role.js';

/**
 * Персонализированная лента рекомендаций по всему каталогу.
 *
 * Flow: Gorse recommend → load items → slice limit.
 * Если Gorse пуст — возвращаем пустой список.
 */
@Injectable()
export class GetFeedInteractor {
  public constructor(
    @Inject(RecommendationService) private readonly recommendation: RecommendationService,
    @Inject(ItemQueryPort) private readonly itemQuery: ItemQueryPort,
  ) {}

  public async execute(query: {
    userId?: UserId;
    cityId: string;
    ageGroup: AgeGroup;
    cursor?: string;
    limit: number;
  }) {
    const offset = parseOffsetCursor(query.cursor);

    const recommendedIds = await this.recommendation
      .recommend({
        userId: query.userId,
        cityId: query.cityId,
        ageGroup: query.ageGroup,
        offset,
        limit: query.limit,
      })
      .catch((): ItemId[] => []);

    if (recommendedIds.length === 0) {
      return Right({ items: [], nextCursor: null });
    }

    const items = await this.itemQuery.findByIds(recommendedIds);

    const itemMap = new Map(items.map((i) => [i.itemId, i]));
    const orderedItems = recommendedIds
      .map((id) => itemMap.get(id))
      .filter((i) => i !== undefined)
      .slice(0, query.limit);

    return Right({
      items: orderedItems.map(toListView),
      nextCursor: nextOffsetCursor(offset, orderedItems.length, query.limit),
    });
  }
}

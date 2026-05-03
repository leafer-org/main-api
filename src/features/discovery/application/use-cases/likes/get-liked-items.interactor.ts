import { Inject, Injectable } from '@nestjs/common';

import { ItemCardEnrichmentPort, LikedItemsQueryPort } from '../../ports.js';
import { Right } from '@/infra/lib/box.js';
import type { UserId } from '@/kernel/domain/ids.js';

/** Лайкнутые товары пользователя. Сортировка по likedAt DESC, cursor-based пагинация, поиск по title (ILIKE). */
@Injectable()
export class GetLikedItemsInteractor {
  public constructor(
    @Inject(LikedItemsQueryPort) private readonly likedItemsQuery: LikedItemsQueryPort,
    @Inject(ItemCardEnrichmentPort) private readonly cardEnrichment: ItemCardEnrichmentPort,
  ) {}

  public async execute(query: {
    userId: UserId;
    search?: string;
    cursor?: string;
    limit: number;
  }) {
    const result = await this.likedItemsQuery.findLikedItems(query);

    const enrichment = await this.cardEnrichment.enrich({
      items: result.items.map((i) => ({ itemId: i.itemId, typeId: i.typeId })),
    });

    const items = result.items.map((i) => {
      const e = enrichment.get(String(i.itemId));
      return e === undefined ? i : { ...i, ...e };
    });

    return Right({ items, nextCursor: result.nextCursor });
  }
}

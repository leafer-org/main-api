import { Inject, Injectable } from '@nestjs/common';

import { ItemCardEnrichmentPort, SearchLogPort, SearchPort } from '../../ports.js';
import type { DynamicSearchFilters } from './types.js';
import { Right } from '@/infra/lib/box.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';
import type { AgeGroupOption } from '@/kernel/domain/vo/age-group.js';

/** Полнотекстовый поиск через Meilisearch с динамическими фасетными фильтрами. */
@Injectable()
export class SearchItemsInteractor {
  public constructor(
    @Inject(SearchPort) private readonly searchPort: SearchPort,
    @Inject(ItemCardEnrichmentPort) private readonly cardEnrichment: ItemCardEnrichmentPort,
    @Inject(SearchLogPort) private readonly searchLog: SearchLogPort,
  ) {}

  public async execute(query: {
    query: string;
    cityId: string;
    ageGroup: AgeGroupOption;
    filters?: DynamicSearchFilters;
    cursor?: string;
    limit: number;
  }) {
    const result = await this.searchPort.search(query);

    if (!query.cursor) {
      await this.searchLog
        .logQuery(NO_TRANSACTION, query.cityId, query.query)
        .catch(() => undefined);
    }

    const enrichment = await this.cardEnrichment.enrich({
      items: result.items.map((i) => ({ itemId: i.itemId, typeId: i.typeId })),
    });

    return Right({
      ...result,
      items: result.items.map((i) => {
        const e = enrichment.get(String(i.itemId));
        return e === undefined ? i : { ...i, ...e };
      }),
    });
  }
}

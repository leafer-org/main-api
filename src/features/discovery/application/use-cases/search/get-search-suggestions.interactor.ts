import { Inject, Injectable } from '@nestjs/common';

import {
  ItemCardEnrichmentPort,
  SearchPort,
  SearchSuggestionsQueryPort,
} from '../../ports.js';
import type { SearchSuggestionsResult } from '../../../domain/read-models/search-suggestion.read-model.js';
import { Right } from '@/infra/lib/box.js';
import { AgeGroupOption } from '@/kernel/domain/vo/age-group.js';

const CATEGORY_LIMIT = 5;
const TYPE_LIMIT = 5;
const ORG_LIMIT = 5;
const ITEM_LIMIT = 5;
const POPULAR_LIMIT = 8;

/**
 * Подсказки автокомплита поиска: категории/типы — по name LIKE, товары — через Meilisearch,
 * популярные — из лога. Пустой query → только популярные (для пустого инпута).
 */
@Injectable()
export class GetSearchSuggestionsInteractor {
  public constructor(
    @Inject(SearchSuggestionsQueryPort)
    private readonly suggestionsQuery: SearchSuggestionsQueryPort,
    @Inject(SearchPort) private readonly searchPort: SearchPort,
    @Inject(ItemCardEnrichmentPort) private readonly cardEnrichment: ItemCardEnrichmentPort,
  ) {}

  public async execute(input: {
    query: string;
    cityId: string;
    ageGroup: AgeGroupOption;
  }) {
    const trimmed = input.query.trim();

    if (trimmed.length === 0) {
      const empty: SearchSuggestionsResult = {
        categories: [],
        itemTypes: [],
        organizations: [],
        items: [],
        popularQueries: [],
      };
      return Right(empty);
    }

    const [categories, itemTypes, organizations, popularQueries, itemsResult] = await Promise.all([
      this.suggestionsQuery.findCategoriesByName(trimmed, CATEGORY_LIMIT),
      this.suggestionsQuery.findItemTypesByName(trimmed, TYPE_LIMIT),
      this.suggestionsQuery.findOrganizationsByName(trimmed, ORG_LIMIT),
      this.suggestionsQuery.findPopularQueries(input.cityId, trimmed, POPULAR_LIMIT),
      this.searchPort.search({
        query: trimmed,
        cityId: input.cityId,
        ageGroup: input.ageGroup,
        limit: ITEM_LIMIT,
      }),
    ]);

    const enrichment = await this.cardEnrichment.enrich({
      items: itemsResult.items.map((i) => ({ itemId: i.itemId, typeId: i.typeId })),
    });
    const items = itemsResult.items.map((i) => {
      const e = enrichment.get(String(i.itemId));
      return e === undefined ? i : { ...i, ...e };
    });

    const result: SearchSuggestionsResult = {
      categories,
      itemTypes,
      organizations,
      items,
      popularQueries,
    };
    return Right(result);
  }
}

import { Inject, Injectable } from '@nestjs/common';

import { SearchPort } from '../../ports.js';
import type { DynamicSearchFilters } from './types.js';
import { Right } from '@/infra/lib/box.js';
import type { AgeGroup } from '@/kernel/domain/vo/role.js';

/** Полнотекстовый поиск через Meilisearch с динамическими фасетными фильтрами. */
@Injectable()
export class SearchItemsInteractor {
  public constructor(@Inject(SearchPort) private readonly searchPort: SearchPort) {}

  public async execute(query: {
    query: string;
    cityId: string;
    ageGroup: AgeGroup;
    filters?: DynamicSearchFilters;
    cursor?: string;
    limit: number;
  }) {
    const result = await this.searchPort.search(query);
    return Right(result);
  }
}

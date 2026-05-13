import { Inject, Injectable } from '@nestjs/common';

import { CategorySearchSyncPort } from '../../application/sync-ports.js';
import {
  DISCOVERY_CATEGORIES_SEARCH_INDEX,
  DiscoveryCategoriesSearchClient,
} from './discovery-categories-search.index.js';
import type { CategoryId } from '@/kernel/domain/ids.js';

@Injectable()
export class MeiliCategorySearchSyncAdapter implements CategorySearchSyncPort {
  public constructor(
    @Inject(DiscoveryCategoriesSearchClient)
    private readonly searchClient: InstanceType<typeof DiscoveryCategoriesSearchClient>,
  ) {}

  public async upsert(input: { categoryId: CategoryId; name: string }): Promise<void> {
    const doc = { categoryId: String(input.categoryId), name: input.name };
    await this.searchClient.addDocument(DISCOVERY_CATEGORIES_SEARCH_INDEX, doc.categoryId, doc);
  }

  public async delete(categoryId: CategoryId): Promise<void> {
    await this.searchClient.deleteDoc(DISCOVERY_CATEGORIES_SEARCH_INDEX, String(categoryId));
  }
}

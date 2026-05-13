import { Inject, Injectable } from '@nestjs/common';

import { ItemTypeSearchSyncPort } from '../../application/sync-ports.js';
import {
  DISCOVERY_ITEM_TYPES_SEARCH_INDEX,
  DiscoveryItemTypesSearchClient,
} from './discovery-item-types-search.index.js';
import type { TypeId } from '@/kernel/domain/ids.js';

@Injectable()
export class MeiliItemTypeSearchSyncAdapter implements ItemTypeSearchSyncPort {
  public constructor(
    @Inject(DiscoveryItemTypesSearchClient)
    private readonly searchClient: InstanceType<typeof DiscoveryItemTypesSearchClient>,
  ) {}

  public async upsert(input: { typeId: TypeId; name: string }): Promise<void> {
    const doc = { typeId: String(input.typeId), name: input.name };
    await this.searchClient.addDocument(DISCOVERY_ITEM_TYPES_SEARCH_INDEX, doc.typeId, doc);
  }

  public async delete(typeId: TypeId): Promise<void> {
    await this.searchClient.deleteDoc(DISCOVERY_ITEM_TYPES_SEARCH_INDEX, String(typeId));
  }
}

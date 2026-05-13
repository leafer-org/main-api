import type { IndexDefinition } from '@/infra/lib/nest-search/index.js';
import { CreateSearchClient } from '@/infra/lib/nest-search/index.js';

export const DISCOVERY_ITEM_TYPES_SEARCH_INDEX = 'discovery_item_types_search';

export const discoveryItemTypesSearchIndexDefinition: IndexDefinition = {
  name: DISCOVERY_ITEM_TYPES_SEARCH_INDEX,
  primaryKey: 'typeId',
  searchableAttributes: ['name'],
  filterableAttributes: [],
  sortableAttributes: [],
};

export const DiscoveryItemTypesSearchClient = CreateSearchClient([
  discoveryItemTypesSearchIndexDefinition,
]);

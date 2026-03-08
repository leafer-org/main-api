import type { IndexDefinition } from '@/infra/lib/nest-search/index.js';
import { CreateSearchClient } from '@/infra/lib/nest-search/index.js';

export const DISCOVERY_ITEMS_INDEX = 'discovery_items';

export const discoveryItemsIndexDefinition: IndexDefinition = {
  name: DISCOVERY_ITEMS_INDEX,
  primaryKey: 'itemId',
  searchableAttributes: ['title', 'description', 'ownerName', 'address'],
  filterableAttributes: [
    'cityId',
    'ageGroup',
    'categoryIds',
    'typeId',
    'price',
    'attributeValues',
  ],
  sortableAttributes: ['price', 'publishedAt'],
};

export const DiscoveryItemsSearchClient = CreateSearchClient([discoveryItemsIndexDefinition]);

import type { IndexDefinition } from '@/infra/lib/nest-search/index.js';
import { CreateSearchClient } from '@/infra/lib/nest-search/index.js';

export const DISCOVERY_CATEGORIES_SEARCH_INDEX = 'discovery_categories_search';

export const discoveryCategoriesSearchIndexDefinition: IndexDefinition = {
  name: DISCOVERY_CATEGORIES_SEARCH_INDEX,
  primaryKey: 'categoryId',
  searchableAttributes: ['name'],
  filterableAttributes: [],
  sortableAttributes: [],
};

export const DiscoveryCategoriesSearchClient = CreateSearchClient([
  discoveryCategoriesSearchIndexDefinition,
]);

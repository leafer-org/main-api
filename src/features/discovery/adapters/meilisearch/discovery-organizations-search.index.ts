import type { IndexDefinition } from '@/infra/lib/nest-search/index.js';
import { CreateSearchClient } from '@/infra/lib/nest-search/index.js';

export const DISCOVERY_ORGANIZATIONS_SEARCH_INDEX = 'discovery_organizations_search';

export const discoveryOrganizationsSearchIndexDefinition: IndexDefinition = {
  name: DISCOVERY_ORGANIZATIONS_SEARCH_INDEX,
  primaryKey: 'organizationId',
  searchableAttributes: ['name'],
  filterableAttributes: [],
  sortableAttributes: [],
};

export const DiscoveryOrganizationsSearchClient = CreateSearchClient([
  discoveryOrganizationsSearchIndexDefinition,
]);

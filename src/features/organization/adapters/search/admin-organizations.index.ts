import type { IndexDefinition } from '@/infra/lib/nest-search/index.js';
import { CreateSearchClient } from '@/infra/lib/nest-search/index.js';

export const ADMIN_ORGANIZATIONS_INDEX = 'admin_organizations';

export const adminOrganizationsIndexDefinition: IndexDefinition = {
  name: ADMIN_ORGANIZATIONS_INDEX,
  primaryKey: 'organizationId',
  searchableAttributes: ['name', 'description'],
  filterableAttributes: ['infoDraftStatus', 'hasPublication', 'isClaimed', 'planId', 'createdAt', 'updatedAt'],
  sortableAttributes: ['createdAt', 'updatedAt'],
};

export const AdminOrganizationsSearchClient = CreateSearchClient([adminOrganizationsIndexDefinition]);

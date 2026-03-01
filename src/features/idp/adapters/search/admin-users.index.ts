import type { IndexDefinition } from '@/infra/lib/nest-search/index.js';
import { CreateSearchClient } from '@/infra/lib/nest-search/index.js';

export const ADMIN_USERS_INDEX = 'admin_users';

export const adminUsersIndexDefinition: IndexDefinition = {
  name: ADMIN_USERS_INDEX,
  primaryKey: 'userId',
  searchableAttributes: ['fullName', 'phoneNumber'],
  filterableAttributes: ['role', 'createdAt', 'updatedAt'],
  sortableAttributes: ['createdAt', 'updatedAt'],
};

export const AdminUsersSearchClient = CreateSearchClient([adminUsersIndexDefinition]);

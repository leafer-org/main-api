import { ManualPermissionsStore } from '@/infra/lib/authorization/permissions-store.js';
import { Permissions } from '@/kernel/domain/permissions.js';

export const appPermissionsStore = new ManualPermissionsStore((can) => ({
  ADMIN: [can(Permissions.manageSession, 'all')],
  USER: [can(Permissions.manageSession, 'self')],
}));

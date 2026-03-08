import type { EmployeeRoleId } from '@/kernel/domain/ids.js';
import type { OrganizationPermission } from '../aggregates/organization/config.js';

export type EmployeeRoleListReadModel = {
  roles: {
    id: EmployeeRoleId;
    name: string;
    permissions: OrganizationPermission[];
  }[];
};

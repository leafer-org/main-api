import type { OrganizationPermission } from '../aggregates/organization/config.js';
import type { EmployeeRoleId } from '@/kernel/domain/ids.js';

export type EmployeeRoleListReadModel = {
  roles: {
    id: EmployeeRoleId;
    name: string;
    permissions: OrganizationPermission[];
  }[];
};

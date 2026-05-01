import type { RoleId } from '@/kernel/domain/ids.js';
import type { Permission } from '@/kernel/domain/permissions.js';

export type CreateRoleCommand = {
  type: 'CreateRole';
  id: RoleId;
  name: string;
  permissions: Permission[];
  now: Date;
};

export type UpdateRoleCommand = {
  type: 'UpdateRole';
  permissions: Permission[];
  now: Date;
};

export type DeleteRoleCommand = {
  type: 'DeleteRole';
  replacementRoleName: string;
};

export type RoleCommand = CreateRoleCommand | UpdateRoleCommand | DeleteRoleCommand;

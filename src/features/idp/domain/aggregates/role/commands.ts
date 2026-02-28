import type { RoleId } from '@/kernel/domain/ids.js';

export type CreateRoleCommand = {
  type: 'CreateRole';
  id: RoleId;
  name: string;
  permissions: Record<string, unknown>;
  now: Date;
};

export type UpdateRoleCommand = {
  type: 'UpdateRole';
  permissions: Record<string, unknown>;
  now: Date;
};

export type DeleteRoleCommand = {
  type: 'DeleteRole';
  replacementRoleName: string;
};

export type RoleCommand = CreateRoleCommand | UpdateRoleCommand | DeleteRoleCommand;

import type { RoleId } from '@/kernel/domain/ids.js';
import type { Permission } from '@/kernel/domain/permissions.js';

export type RoleCreatedEvent = {
  type: 'role.created';
  id: RoleId;
  name: string;
  permissions: Permission[];
  createdAt: Date;
};

export type RoleUpdatedEvent = {
  type: 'role.updated';
  permissions: Permission[];
  updatedAt: Date;
};

export type RoleDeletedEvent = {
  type: 'role.deleted';
  roleName: string;
  replacementRoleName: string;
};

export type RoleEvent = RoleCreatedEvent | RoleUpdatedEvent | RoleDeletedEvent;

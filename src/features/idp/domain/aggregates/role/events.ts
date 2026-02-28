import type { RoleId } from '@/kernel/domain/ids.js';

export type RoleCreatedEvent = {
  type: 'role.created';
  id: RoleId;
  name: string;
  permissions: Record<string, unknown>;
  createdAt: Date;
};

export type RoleUpdatedEvent = {
  type: 'role.updated';
  permissions: Record<string, unknown>;
  updatedAt: Date;
};

export type RoleDeletedEvent = {
  type: 'role.deleted';
  roleName: string;
  replacementRoleName: string;
};

export type RoleEvent = RoleCreatedEvent | RoleUpdatedEvent | RoleDeletedEvent;

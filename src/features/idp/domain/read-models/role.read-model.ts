import type { RoleId } from '@/kernel/domain/ids.js';
import type { Permission } from '@/kernel/domain/permissions.js';

export type RoleReadModel = {
  id: RoleId;
  name: string;
  permissions: Permission[];
  isStatic: boolean;
  createdAt: Date;
  updatedAt: Date;
};

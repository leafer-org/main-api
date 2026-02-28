import type { RoleId } from '@/kernel/domain/ids.js';

export type RoleState = {
  id: RoleId;
  name: string;
  permissions: Record<string, unknown>;
  isStatic: boolean;
  createdAt: Date;
  updatedAt: Date;
};

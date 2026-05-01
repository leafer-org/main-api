import type { Permission } from '@/kernel/domain/permissions.js';

export type RoleKey = string;

export type PermissionsMap = {
  roles: Record<RoleKey, readonly Permission[]>;
};

export abstract class PermissionsStore {
  public abstract get(): Promise<PermissionsMap>;
}

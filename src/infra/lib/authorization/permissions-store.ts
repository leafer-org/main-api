import { type InferPermissionValue, type PermissionVariant } from './schema.js';

export type PermissionAction = string;
export type RoleKey = string;
export type PermissionValue = unknown;

export type RolePermissions = Record<PermissionAction, PermissionValue>;

export type PermissionsMap = {
  roles: Record<RoleKey, RolePermissions>;
};

export abstract class PermissionsStore {
  public abstract get(): PermissionsMap;
  public abstract refresh(): Promise<void>;
}

type ManualPermissionsMap = Record<RoleKey, [PermissionAction, PermissionValue][]>;

export class ManualPermissionsStore implements PermissionsStore {
  private readonly permissionMap: PermissionsMap;

  public constructor(
    builder: (
      can: <T extends PermissionVariant>(
        perm: T,
        ...args: InferPermissionValue<T> extends boolean
          ? [value?: boolean]
          : [value: InferPermissionValue<T>]
      ) => [PermissionAction, PermissionValue],
    ) => ManualPermissionsMap,
  ) {
    const map = builder((perm, ...args) => [perm.action, args[0] ?? true]);

    const roles = Object.fromEntries(
      Object.entries(map).map(([role, permissions]) => [role, Object.fromEntries(permissions)]),
    );
    this.permissionMap = { roles };
  }

  public get() {
    return this.permissionMap;
  }

  public async refresh(): Promise<void> {
    // Static store — nothing to refresh
  }
}

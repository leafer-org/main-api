export type PermissionAction = string;
export type RoleKey = string;
export type PermissionValue = unknown;

export type RolePermissions = Record<PermissionAction, PermissionValue>;

export type PermissionsMap = {
  roles: Record<RoleKey, RolePermissions>;
};

export abstract class PermissionsStore {
  public abstract get(): Promise<PermissionsMap>;
}

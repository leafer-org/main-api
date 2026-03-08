import { ADMIN_ROLE_NAME, type OrganizationPermission } from '../config.js';
import { CannotDeleteAdminRoleError, RoleNotFoundError } from '../errors.js';
import type { EmployeeEntity } from './employee.entity.js';
import type { EntityState } from '@/infra/ddd/entity-state.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';
import type { EmployeeRoleId } from '@/kernel/domain/ids.js';

export type EmployeeRoleEntity = EntityState<{
  id: EmployeeRoleId;
  name: string;
  permissions: OrganizationPermission[];
}>;

export const EmployeeRoleEntity = {
  find(roles: EmployeeRoleEntity[], roleId: EmployeeRoleId): EmployeeRoleEntity | undefined {
    return roles.find((r) => (r.id as string) === (roleId as string));
  },

  findAdmin(roles: EmployeeRoleEntity[]): EmployeeRoleEntity {
    return roles.find((r) => r.name === ADMIN_ROLE_NAME)!;
  },

  isAdmin(role: EmployeeRoleEntity): boolean {
    return role.name === ADMIN_ROLE_NAME;
  },

  exists(roles: EmployeeRoleEntity[], roleId: EmployeeRoleId): boolean {
    return roles.some((r) => (r.id as string) === (roleId as string));
  },

  createOne(
    id: EmployeeRoleId,
    name: string,
    permissions: OrganizationPermission[],
  ): EmployeeRoleEntity {
    return { id, name, permissions };
  },

  create(
    roles: EmployeeRoleEntity[],
    id: EmployeeRoleId,
    name: string,
    permissions: OrganizationPermission[],
  ): EmployeeRoleEntity[] {
    return [...roles, { id, name, permissions }];
  },

  update(
    roles: EmployeeRoleEntity[],
    roleId: EmployeeRoleId,
    name: string,
    permissions: OrganizationPermission[],
  ): Either<RoleNotFoundError, EmployeeRoleEntity[]> {
    if (!EmployeeRoleEntity.find(roles, roleId)) {
      return Left(new RoleNotFoundError());
    }

    return Right(
      roles.map((r) => ((r.id as string) === (roleId as string) ? { ...r, name, permissions } : r)),
    );
  },

  delete(
    roles: EmployeeRoleEntity[],
    employees: EmployeeEntity[],
    roleId: EmployeeRoleId,
    replacementRoleId: EmployeeRoleId,
  ): Either<
    RoleNotFoundError | CannotDeleteAdminRoleError,
    { roles: EmployeeRoleEntity[]; employees: EmployeeEntity[] }
  > {
    const role = EmployeeRoleEntity.find(roles, roleId);
    if (!role) return Left(new RoleNotFoundError());
    if (EmployeeRoleEntity.isAdmin(role)) return Left(new CannotDeleteAdminRoleError());
    if (!EmployeeRoleEntity.find(roles, replacementRoleId)) return Left(new RoleNotFoundError());

    return Right({
      roles: roles.filter((r) => (r.id as string) !== (roleId as string)),
      employees: employees.map((e) =>
        (e.roleId as string) === (roleId as string) ? { ...e, roleId: replacementRoleId } : e,
      ),
    });
  },
};

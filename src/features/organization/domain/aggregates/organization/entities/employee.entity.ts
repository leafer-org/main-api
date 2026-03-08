import {
  CannotRemoveOwnerError,
  EmployeeAlreadyExistsError,
  EmployeeLimitReachedError,
  EmployeeNotFoundError,
  TransferTargetNotEmployeeError,
} from '../errors.js';
import type { EntityState } from '@/infra/ddd/entity-state.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';
import type { EmployeeRoleId, UserId } from '@/kernel/domain/ids.js';

export type EmployeeEntity = EntityState<{
  userId: UserId;
  roleId: EmployeeRoleId;
  isOwner: boolean;
  joinedAt: Date;
}>;

export const EmployeeEntity = {
  createOwner(userId: UserId, roleId: EmployeeRoleId, joinedAt: Date): EmployeeEntity {
    return { userId, roleId, isOwner: true, joinedAt };
  },

  find(employees: EmployeeEntity[], userId: UserId): EmployeeEntity | undefined {
    return employees.find((e) => (e.userId as string) === (userId as string));
  },

  findOwner(employees: EmployeeEntity[]): EmployeeEntity {
    return employees.find((e) => e.isOwner)!;
  },

  invite(
    employees: EmployeeEntity[],
    userId: UserId,
    roleId: EmployeeRoleId,
    maxEmployees: number,
    now: Date,
  ): Either<EmployeeAlreadyExistsError | EmployeeLimitReachedError, EmployeeEntity[]> {
    if (EmployeeEntity.find(employees, userId)) {
      return Left(new EmployeeAlreadyExistsError());
    }
    if (employees.length >= maxEmployees) {
      return Left(new EmployeeLimitReachedError());
    }

    return Right([...employees, { userId, roleId, isOwner: false, joinedAt: now }]);
  },

  remove(
    employees: EmployeeEntity[],
    userId: UserId,
  ): Either<EmployeeNotFoundError | CannotRemoveOwnerError, EmployeeEntity[]> {
    const employee = EmployeeEntity.find(employees, userId);
    if (!employee) return Left(new EmployeeNotFoundError());
    if (employee.isOwner) return Left(new CannotRemoveOwnerError());

    return Right(employees.filter((e) => (e.userId as string) !== (userId as string)));
  },

  changeRole(
    employees: EmployeeEntity[],
    userId: UserId,
    roleId: EmployeeRoleId,
  ): Either<EmployeeNotFoundError, EmployeeEntity[]> {
    if (!EmployeeEntity.find(employees, userId)) {
      return Left(new EmployeeNotFoundError());
    }

    return Right(
      employees.map((e) => ((e.userId as string) === (userId as string) ? { ...e, roleId } : e)),
    );
  },

  transferOwnership(
    employees: EmployeeEntity[],
    fromUserId: UserId,
    toUserId: UserId,
    adminRoleId: EmployeeRoleId,
  ): Either<EmployeeNotFoundError | TransferTargetNotEmployeeError, EmployeeEntity[]> {
    if (!EmployeeEntity.find(employees, fromUserId)) {
      return Left(new EmployeeNotFoundError());
    }
    if (!EmployeeEntity.find(employees, toUserId)) {
      return Left(new TransferTargetNotEmployeeError());
    }

    return Right(
      employees.map((e) => {
        if ((e.userId as string) === (fromUserId as string)) {
          return { ...e, isOwner: false };
        }
        if ((e.userId as string) === (toUserId as string)) {
          return { ...e, isOwner: true, roleId: adminRoleId };
        }
        return e;
      }),
    );
  },

  blockExcess(
    employees: EmployeeEntity[],
    maxEmployees: number,
  ): { kept: EmployeeEntity[]; blockedIds: UserId[] } {
    const owner = EmployeeEntity.findOwner(employees);
    const nonOwners = employees.filter((e) => !e.isOwner);
    const keepCount = Math.max(0, maxEmployees - 1); // -1 for owner

    const kept = [owner, ...nonOwners.slice(0, keepCount)];
    const blockedIds = nonOwners.slice(keepCount).map((e) => e.userId);

    const keptSet = new Set(kept.map((e) => e.userId as string));

    return {
      kept: employees.filter((e) => keptSet.has(e.userId as string)),
      blockedIds,
    };
  },
};

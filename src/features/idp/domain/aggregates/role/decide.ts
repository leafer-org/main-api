import type { RoleCommand } from './commands.js';
import {
  RoleAlreadyExistsError,
  RoleNotFoundError,
  StaticRoleModificationError,
} from './errors.js';
import type { RoleEvent } from './events.js';
import type { RoleState } from './state.js';
import { assertNever } from '@/infra/ddd/utils.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';

export function roleDecide(
  state: RoleState | null,
  command: RoleCommand,
): Either<RoleAlreadyExistsError | RoleNotFoundError | StaticRoleModificationError, RoleEvent> {
  switch (command.type) {
    case 'CreateRole': {
      if (state) return Left(new RoleAlreadyExistsError());
      return Right({
        type: 'role.created',
        id: command.id,
        name: command.name,
        permissions: command.permissions,
        createdAt: command.now,
      });
    }

    case 'UpdateRole': {
      if (!state) return Left(new RoleNotFoundError());
      if (state.isStatic) return Left(new StaticRoleModificationError());
      return Right({
        type: 'role.updated',
        permissions: command.permissions,
        updatedAt: command.now,
      });
    }

    case 'DeleteRole': {
      if (!state) return Left(new RoleNotFoundError());
      if (state.isStatic) return Left(new StaticRoleModificationError());
      return Right({
        type: 'role.deleted',
        roleName: state.name,
        replacementRoleName: command.replacementRoleName,
      });
    }

    default:
      assertNever(command);
  }
}

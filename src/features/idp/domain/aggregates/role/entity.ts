import type { CreateRoleCommand, DeleteRoleCommand, UpdateRoleCommand } from './commands.js';
import {
  RoleAlreadyExistsError,
  RoleNotFoundError,
  StaticRoleModificationError,
} from './errors.js';
import type { RoleCreatedEvent, RoleDeletedEvent, RoleUpdatedEvent } from './events.js';
import type { RoleState } from './state.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';

export type { RoleState } from './state.js';

export const RoleEntity = {
  create(
    state: RoleState | null,
    cmd: CreateRoleCommand,
  ): Either<RoleAlreadyExistsError, { state: RoleState; event: RoleCreatedEvent }> {
    if (state) return Left(new RoleAlreadyExistsError());

    const event: RoleCreatedEvent = {
      type: 'role.created',
      id: cmd.id,
      name: cmd.name,
      permissions: cmd.permissions,
      createdAt: cmd.now,
    };

    const newState: RoleState = {
      id: cmd.id,
      name: cmd.name,
      permissions: cmd.permissions,
      isStatic: false,
      createdAt: cmd.now,
      updatedAt: cmd.now,
    };

    return Right({ state: newState, event });
  },

  update(
    state: RoleState | null,
    cmd: UpdateRoleCommand,
  ): Either<
    RoleNotFoundError | StaticRoleModificationError,
    { state: RoleState; event: RoleUpdatedEvent }
  > {
    if (!state) return Left(new RoleNotFoundError());
    if (state.isStatic) return Left(new StaticRoleModificationError());

    const event: RoleUpdatedEvent = {
      type: 'role.updated',
      permissions: cmd.permissions,
      updatedAt: cmd.now,
    };

    return Right({
      state: {
        ...state,
        permissions: cmd.permissions,
        updatedAt: cmd.now,
      },
      event,
    });
  },

  delete(
    state: RoleState | null,
    cmd: DeleteRoleCommand,
  ): Either<
    RoleNotFoundError | StaticRoleModificationError,
    { state: RoleState; event: RoleDeletedEvent }
  > {
    if (!state) return Left(new RoleNotFoundError());
    if (state.isStatic) return Left(new StaticRoleModificationError());

    const event: RoleDeletedEvent = {
      type: 'role.deleted',
      roleName: state.name,
      replacementRoleName: cmd.replacementRoleName,
    };

    return Right({ state, event });
  },
};

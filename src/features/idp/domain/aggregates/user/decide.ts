import type { UserCommand } from './commands.js';
import type { UserEvent } from './events.js';
import type { UserState } from './state.js';
import { UserAlreadyExistsError, UserNotFoundError } from './user.errors.js';
import { assertNever } from '@/infra/ddd/utils.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';

export function userDecide(
  state: UserState | null,
  command: UserCommand,
): Either<UserAlreadyExistsError | UserNotFoundError, UserEvent> {
  switch (command.type) {
    case 'CreateUser': {
      if (state) return Left(new UserAlreadyExistsError());
      return Right({
        type: 'user.created',
        id: command.id,
        phoneNumber: command.phoneNumber,
        fullName: command.fullName,
        role: command.role,
        createdAt: command.now,
      });
    }

    case 'UpdateProfile': {
      if (!state) return Left(new UserNotFoundError());
      return Right({
        type: 'user.profile_updated',
        fullName: command.fullName,
        updatedAt: command.now,
      });
    }

    case 'UpdateUserRole': {
      if (!state) return Left(new UserNotFoundError());
      return Right({
        type: 'user.role_updated',
        userId: state.id,
        role: command.role,
        updatedAt: command.now,
      });
    }

    default:
      assertNever(command);
  }
}

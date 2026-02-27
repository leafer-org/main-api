import type { SessionCommand } from './commands.js';
import { SessionAlreadyExistsError, SessionNotFoundError } from './errors.js';
import type { SessionEvent } from './events.js';
import type { SessionState } from './state.js';
import { assertNever } from '@/infra/ddd/utils.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';

export function sessionDecide(
  state: SessionState | null,
  command: SessionCommand,
): Either<SessionAlreadyExistsError | SessionNotFoundError, SessionEvent> {
  switch (command.type) {
    case 'CreateSession': {
      if (state) return Left(new SessionAlreadyExistsError());
      return Right({
        type: 'session.created',
        id: command.id,
        userId: command.userId,
        createdAt: command.now,
        expiresAt: new Date(command.now.getTime() + command.ttlMs),
      });
    }

    case 'RotateSession': {
      if (!state) return Left(new SessionNotFoundError());
      return Right({
        type: 'session.rotated',
        newId: command.newId,
        userId: command.userId,
        createdAt: command.now,
        expiresAt: new Date(command.now.getTime() + command.ttlMs),
      });
    }

    case 'DeleteSession': {
      if (!state) return Left(new SessionNotFoundError());
      return Right({ type: 'session.deleted' });
    }

    default:
      assertNever(command);
  }
}

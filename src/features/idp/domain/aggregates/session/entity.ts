import type {
  CreateSessionCommand,
  DeleteSessionCommand,
  RotateSessionCommand,
} from './commands.js';
import { SessionAlreadyExistsError, SessionNotFoundError } from './errors.js';
import type { SessionCreatedEvent, SessionDeletedEvent, SessionRotatedEvent } from './events.js';
import type { SessionState } from './state.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';

export type { SessionState } from './state.js';

export const SessionEntity = {
  create(
    state: SessionState | null,
    cmd: CreateSessionCommand,
  ): Either<SessionAlreadyExistsError, { state: SessionState; event: SessionCreatedEvent }> {
    if (state) return Left(new SessionAlreadyExistsError());

    const event: SessionCreatedEvent = {
      type: 'session.created',
      id: cmd.id,
      userId: cmd.userId,
      createdAt: cmd.now,
      expiresAt: new Date(cmd.now.getTime() + cmd.ttlMs),
    };

    const newState: SessionState = {
      id: cmd.id,
      userId: cmd.userId,
      createdAt: cmd.now,
      expiresAt: new Date(cmd.now.getTime() + cmd.ttlMs),
    };

    return Right({ state: newState, event });
  },

  rotate(
    state: SessionState | null,
    cmd: RotateSessionCommand,
  ): Either<SessionNotFoundError, { state: SessionState; event: SessionRotatedEvent }> {
    if (!state) return Left(new SessionNotFoundError());

    const event: SessionRotatedEvent = {
      type: 'session.rotated',
      newId: cmd.newId,
      userId: cmd.userId,
      createdAt: cmd.now,
      expiresAt: new Date(cmd.now.getTime() + cmd.ttlMs),
    };

    const newState: SessionState = {
      id: cmd.newId,
      userId: cmd.userId,
      createdAt: cmd.now,
      expiresAt: new Date(cmd.now.getTime() + cmd.ttlMs),
    };

    return Right({ state: newState, event });
  },

  delete(
    state: SessionState | null,
    _cmd: DeleteSessionCommand,
  ): Either<SessionNotFoundError, { state: null; event: SessionDeletedEvent }> {
    if (!state) return Left(new SessionNotFoundError());

    return Right({ state: null, event: { type: 'session.deleted' } });
  },
};

import type { SessionEvent } from './events.js';
import type { SessionState } from './state.js';
import { assertNever } from '@/infra/ddd/utils.js';

export function sessionApply(
  _state: SessionState | null,
  event: SessionEvent,
): SessionState | null {
  switch (event.type) {
    case 'session.created':
      return {
        id: event.id,
        userId: event.userId,
        createdAt: event.createdAt,
        expiresAt: event.expiresAt,
      };

    case 'session.rotated':
      return {
        id: event.newId,
        userId: event.userId,
        createdAt: event.createdAt,
        expiresAt: event.expiresAt,
      };

    case 'session.deleted':
      return null;

    default:
      assertNever(event);
  }
}

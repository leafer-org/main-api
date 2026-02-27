import type { LoginCompletedEvent } from '../aggregates/login-process/events.js';
import type { CreateSessionCommand } from '../aggregates/session/commands.js';
import type { SessionId } from '@/kernel/domain/ids.js';

type Deps = {
  sessionId: SessionId;
  now: Date;
  ttlMs: number;
};

export function whenLoginCompletedCreateSession(
  event: LoginCompletedEvent,
  deps: Deps,
): CreateSessionCommand {
  return {
    type: 'CreateSession',
    id: deps.sessionId,
    userId: event.userId,
    now: deps.now,
    ttlMs: deps.ttlMs,
  };
}

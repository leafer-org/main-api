import type { DeleteSessionCommand } from '../aggregates/session/commands.js';
import type { UserBlockedEvent } from '../aggregates/user/events.js';

export function whenUserBlockedDeleteSessions(
  _event: UserBlockedEvent,
): DeleteSessionCommand {
  return {
    type: 'DeleteSession',
  };
}

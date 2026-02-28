import type { DeleteSessionCommand } from '../aggregates/session/commands.js';
import type { UserRoleUpdatedEvent } from '../aggregates/user/events.js';

export function whenUserRoleUpdatedDeleteSessions(
  _event: UserRoleUpdatedEvent,
): DeleteSessionCommand {
  return {
    type: 'DeleteSession',
  };
}

import type { RoleDeletedEvent } from '../aggregates/role/events.js';
import type { UpdateUserRoleCommand } from '../aggregates/user/commands.js';
import { Role } from '@/kernel/domain/vo.js';

type Deps = {
  now: Date;
};

export function whenRoleDeletedUpdateUserRoles(
  event: RoleDeletedEvent,
  deps: Deps,
): UpdateUserRoleCommand {
  return {
    type: 'UpdateUserRole',
    role: Role.raw(event.replacementRoleName),
    now: deps.now,
  };
}

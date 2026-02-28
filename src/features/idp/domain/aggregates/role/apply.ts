import type { RoleEvent } from './events.js';
import type { RoleState } from './state.js';
import { assertNever } from '@/infra/ddd/utils.js';

export function roleApply(state: RoleState | null, event: RoleEvent): RoleState {
  switch (event.type) {
    case 'role.created':
      return {
        id: event.id,
        name: event.name,
        permissions: event.permissions,
        isStatic: false,
        createdAt: event.createdAt,
        updatedAt: event.createdAt,
      };

    case 'role.updated': {
      if (!state) throw new Error('State is required for role.updated');
      return {
        ...state,
        permissions: event.permissions,
        updatedAt: event.updatedAt,
      };
    }

    case 'role.deleted': {
      if (!state) throw new Error('State is required for role.deleted');
      return state;
    }

    default:
      assertNever(event);
  }
}

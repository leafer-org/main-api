import type { UserEvent } from './events.js';
import type { UserState } from './state.js';
import { assertNever } from '@/infra/ddd/utils.js';

export function userApply(state: UserState | null, event: UserEvent): UserState {
  switch (event.type) {
    case 'user.created':
      return {
        id: event.id,
        phoneNumber: event.phoneNumber,
        fullName: event.fullName,
        role: event.role,
        createdAt: event.createdAt,
        updatedAt: event.createdAt,
      };

    case 'user.profile_updated': {
      if (!state) throw new Error('State is required for user.profile_updated');
      return {
        ...state,
        fullName: event.fullName,
        updatedAt: event.updatedAt,
      };
    }

    default:
      assertNever(event);
  }
}

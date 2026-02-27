import type { RegistrationCompletedEvent } from '../aggregates/login-process/events.js';
import type { CreateUserCommand } from '../aggregates/user/commands.js';

type Deps = {
  now: Date;
};

export function whenRegistrationCompletedCreateUser(
  event: RegistrationCompletedEvent,
  deps: Deps,
): CreateUserCommand {
  return {
    type: 'CreateUser',
    id: event.userId,
    phoneNumber: event.phoneNumber,
    fullName: event.fullName,
    role: event.role,
    now: deps.now,
  };
}

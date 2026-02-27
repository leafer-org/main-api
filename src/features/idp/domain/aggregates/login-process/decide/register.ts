import { FingerPrint } from '../../../vo/finger-print.js';
import type { RegisterCommand } from '../commands.js';
import { RegistractionError, RegistrationSessionMismatchError } from '../errors.js';
import type { RegistrationCompletedEvent } from '../events.js';
import type { LoginProcessState } from '../state.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';

export function registerDecide(
  state: LoginProcessState | null,
  command: RegisterCommand,
): Either<RegistrationSessionMismatchError | RegistractionError, RegistrationCompletedEvent> {
  if (!state || state.type !== 'NewRegistration') {
    return Left(new RegistractionError());
  }

  if (
    state.registrationSessionId !== command.registrationSessionId ||
    !FingerPrint.equals(state.fingerPrint, command.fingerPrint)
  ) {
    return Left(new RegistrationSessionMismatchError());
  }

  return Right({
    type: 'login_process.registration_completed',
    userId: command.newUserId,
    role: command.role,
    fingerPrint: state.fingerPrint,
    phoneNumber: state.phoneNumber,
    fullName: command.fullName,
    avatarId: command.avatarId,
  });
}

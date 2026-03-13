import { FingerPrint } from '../../../vo/finger-print.js';
import type { RegisterCommand } from '../commands.js';
import { RegistractionError, RegistrationSessionMismatchError } from '../errors.js';
import type { RegistrationCompletedEvent } from '../events.js';
import type { LoginProcessState } from '../state.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';

export function register(
  state: LoginProcessState | null,
  cmd: RegisterCommand,
): Either<
  RegistrationSessionMismatchError | RegistractionError,
  { state: LoginProcessState; event: RegistrationCompletedEvent }
> {
  if (!state || state.type !== 'NewRegistration') {
    return Left(new RegistractionError());
  }

  if (
    state.registrationSessionId !== cmd.registrationSessionId ||
    !FingerPrint.equals(state.fingerPrint, cmd.fingerPrint)
  ) {
    return Left(new RegistrationSessionMismatchError());
  }

  const event: RegistrationCompletedEvent = {
    type: 'login_process.registration_completed',
    userId: cmd.newUserId,
    role: cmd.role,
    fingerPrint: state.fingerPrint,
    phoneNumber: state.phoneNumber,
    fullName: cmd.fullName,
    avatarId: cmd.avatarId,
    cityId: cmd.cityId,
    lat: cmd.lat,
    lng: cmd.lng,
  };

  const newState: LoginProcessState = {
    id: state.id,
    phoneNumber: state.phoneNumber,
    fingerPrint: state.fingerPrint,
    type: 'Success',
    userId: cmd.newUserId,
  };

  return Right({ state: newState, event });
}

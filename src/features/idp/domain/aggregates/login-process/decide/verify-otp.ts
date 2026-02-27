import { OtpCodeHash } from '../../../vo/otp.js';
import type { VerifyOtpCommand } from '../commands.js';
import { LOGIN_PROCESS_CONFIG } from '../config.js';
import { InvalidOtpError, LoginBlockedError } from '../errors.js';
import type {
  LoginCompletedEvent,
  LoginProcessBlockedEvent,
  NewRegistrationStartedEvent,
  OtpExpiredEvent,
  OtpVerifyFailedEvent,
} from '../events.js';
import { isActivelyBlocked, isOtpExpired, type LoginProcessState } from '../state.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';

type VerifyOtpEvent =
  | OtpExpiredEvent
  | OtpVerifyFailedEvent
  | LoginProcessBlockedEvent
  | NewRegistrationStartedEvent
  | LoginCompletedEvent;

export function verifyOtpDecide(
  state: LoginProcessState | null,
  command: VerifyOtpCommand,
): Either<LoginBlockedError | InvalidOtpError, VerifyOtpEvent> {
  if (state?.type === 'Blocked' && isActivelyBlocked(state, command.now)) {
    return Left(new LoginBlockedError({ blockedUntil: state.blockedUntil }));
  }

  if (!state || state.type !== 'OtpRequested') {
    return Left(new InvalidOtpError());
  }

  if (isOtpExpired(state, command.now)) {
    return Right({ type: 'login_process.otp_expired' });
  }

  if (!OtpCodeHash.verify(command.otpCode, state.codeHash)) {
    const newAttempts = state.verifyAttempts + 1;

    if (newAttempts > LOGIN_PROCESS_CONFIG.MAX_OTP_ATTEMPTS) {
      const blockedUntil = new Date(command.now.getTime() + LOGIN_PROCESS_CONFIG.BLOCK_DURATION_MS);
      return Right({ type: 'login_process.blocked', blockedUntil });
    }

    return Right({ type: 'login_process.otp_verify_failed', lastTryAt: command.now });
  }

  if (!command.user) {
    return Right({
      type: 'login_process.new_registration',
      registrationSessionId: command.registrationSessionId,
    });
  }

  return Right({
    type: 'login_process.completed',
    userId: command.user.id,
    role: command.user.role,
    fingerPrint: state.fingerPrint,
  });
}

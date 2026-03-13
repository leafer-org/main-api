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

export function verifyOtp(
  state: LoginProcessState | null,
  cmd: VerifyOtpCommand,
): Either<
  LoginBlockedError | InvalidOtpError,
  { state: LoginProcessState; event: VerifyOtpEvent }
> {
  if (state?.type === 'Blocked' && isActivelyBlocked(state, cmd.now)) {
    return Left(new LoginBlockedError({ blockedUntil: state.blockedUntil.toISOString() }));
  }

  if (!state || state.type !== 'OtpRequested') {
    return Left(new InvalidOtpError());
  }

  if (isOtpExpired(state, cmd.now)) {
    return Right({
      state: {
        id: state.id,
        phoneNumber: state.phoneNumber,
        fingerPrint: state.fingerPrint,
        type: 'Errored',
        error: 'otp_expired' as const,
      },
      event: { type: 'login_process.otp_expired' as const },
    });
  }

  if (!OtpCodeHash.verify(cmd.otpCode, state.codeHash)) {
    const newAttempts = state.verifyAttempts + 1;

    if (newAttempts > LOGIN_PROCESS_CONFIG.MAX_OTP_ATTEMPTS) {
      const blockedUntil = new Date(cmd.now.getTime() + LOGIN_PROCESS_CONFIG.BLOCK_DURATION_MS);
      return Right({
        state: {
          id: state.id,
          phoneNumber: state.phoneNumber,
          fingerPrint: state.fingerPrint,
          type: 'Blocked',
          blockedUntil,
        },
        event: { type: 'login_process.blocked' as const, blockedUntil },
      });
    }

    return Right({
      state: {
        ...state,
        verifyAttempts: newAttempts,
        lastTryAt: cmd.now,
      },
      event: { type: 'login_process.otp_verify_failed' as const, lastTryAt: cmd.now },
    });
  }

  if (!cmd.user) {
    return Right({
      state: {
        id: state.id,
        phoneNumber: state.phoneNumber,
        fingerPrint: state.fingerPrint,
        type: 'NewRegistration',
        registrationSessionId: cmd.registrationSessionId,
      },
      event: {
        type: 'login_process.new_registration' as const,
        registrationSessionId: cmd.registrationSessionId,
      },
    });
  }

  return Right({
    state: {
      id: state.id,
      phoneNumber: state.phoneNumber,
      fingerPrint: state.fingerPrint,
      type: 'Success',
      userId: cmd.user.id,
    },
    event: {
      type: 'login_process.completed' as const,
      userId: cmd.user.id,
      role: cmd.user.role,
      fingerPrint: state.fingerPrint,
    },
  });
}

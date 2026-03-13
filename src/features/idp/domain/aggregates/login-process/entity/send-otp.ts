import { OtpCodeHash } from '../../../vo/otp.js';
import type { CreateOtpCommand } from '../commands.js';
import { LOGIN_PROCESS_CONFIG } from '../config.js';
import { LoginBlockedError, OtpThrottleError } from '../errors.js';
import type { LoginProcessStartedEvent } from '../events.js';
import type { LoginProcessState } from '../state.js';
import { assertNever } from '@/infra/ddd/utils.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';

export function sendOtp(
  state: LoginProcessState | null,
  cmd: CreateOtpCommand,
): Either<LoginBlockedError | OtpThrottleError, { state: LoginProcessState; event: LoginProcessStartedEvent }> {
  if (state?.type === 'Blocked' && state.blockedUntil.getTime() > cmd.now.getTime()) {
    return Left(new LoginBlockedError({ blockedUntil: state.blockedUntil.toISOString() }));
  }

  if (
    !state ||
    state.type === 'Errored' ||
    state.type === 'Success' ||
    state.type === 'Blocked' ||
    state.type === 'NewRegistration'
  ) {
    const event: LoginProcessStartedEvent = {
      type: 'login_process.started',
      id: cmd.newLoginProcessId,
      phoneNumber: cmd.phoneNumber,
      fingerPrint: cmd.fingerPrint,
      accuredAt: cmd.now,
      lastProcessId: state?.id ?? null,
      otpCode: cmd.otpCode,
    };

    const newState: LoginProcessState = {
      type: 'OtpRequested',
      id: cmd.newLoginProcessId,
      phoneNumber: cmd.phoneNumber,
      fingerPrint: cmd.fingerPrint,
      codeHash: OtpCodeHash.create(cmd.otpCode),
      verifyAttempts: 0,
      expiresAt: new Date(cmd.now.getTime() + LOGIN_PROCESS_CONFIG.OTP_CODE_EXPIRATION_MS),
      requestedAt: cmd.now,
    };

    return Right({ state: newState, event });
  }

  if (state.type === 'OtpRequested') {
    const elapsed = cmd.now.getTime() - state.requestedAt.getTime();
    if (elapsed < LOGIN_PROCESS_CONFIG.OTP_THROTTLE_MS) {
      const retryAfterSec = Math.ceil((LOGIN_PROCESS_CONFIG.OTP_THROTTLE_MS - elapsed) / 1000);
      return Left(new OtpThrottleError({ retryAfterSec }));
    }

    const event: LoginProcessStartedEvent = {
      type: 'login_process.started',
      id: state.id,
      phoneNumber: cmd.phoneNumber,
      fingerPrint: cmd.fingerPrint,
      accuredAt: cmd.now,
      lastProcessId: state.id,
      otpCode: cmd.otpCode,
    };

    const newState: LoginProcessState = {
      type: 'OtpRequested',
      id: state.id,
      phoneNumber: cmd.phoneNumber,
      fingerPrint: cmd.fingerPrint,
      codeHash: OtpCodeHash.create(cmd.otpCode),
      verifyAttempts: 0,
      expiresAt: new Date(cmd.now.getTime() + LOGIN_PROCESS_CONFIG.OTP_CODE_EXPIRATION_MS),
      requestedAt: cmd.now,
    };

    return Right({ state: newState, event });
  }

  assertNever(state);
}

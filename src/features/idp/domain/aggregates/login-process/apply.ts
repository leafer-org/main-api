import { OtpCodeHash } from '../../vo/otp.js';
import { LOGIN_PROCESS_CONFIG } from './config.js';
import type { LoginProcessEvent } from './events.js';
import type { LoginProcessState } from './state.js';
import { assertNever } from '@/infra/ddd/utils.js';

export const loginProcessApply = (
  state: LoginProcessState | null,
  event: LoginProcessEvent,
): LoginProcessState => {
  if (event.type === 'login_process.started') {
    return {
      type: 'OtpRequested',
      id: event.id,
      phoneNumber: event.phoneNumber,
      fingerPrint: event.fingerPrint,
      codeHash: OtpCodeHash.create(event.otpCode),
      verifyAttempts: 0,
      expiresAt: new Date(event.accuredAt.getTime() + LOGIN_PROCESS_CONFIG.OTP_CODE_EXPIRATION_MS),
      requestedAt: event.accuredAt,
    };
  }

  if (!state) {
    throw new Error('State is required for this event');
  }

  switch (event.type) {
    case 'login_process.otp_expired':
      return {
        id: state.id,
        phoneNumber: state.phoneNumber,
        fingerPrint: state.fingerPrint,
        type: 'Errored',
        error: 'otp_expired',
      };

    case 'login_process.otp_verify_failed':
      if (state.type !== 'OtpRequested') throw new Error('Invalid state for otp_verify_failed');
      return {
        ...state,
        verifyAttempts: state.verifyAttempts + 1,
        lastTryAt: event.lastTryAt,
      };

    case 'login_process.blocked':
      return {
        id: state.id,
        phoneNumber: state.phoneNumber,
        fingerPrint: state.fingerPrint,
        type: 'Blocked',
        blockedUntil: event.blockedUntil,
      };

    case 'login_process.new_registration':
      return {
        id: state.id,
        phoneNumber: state.phoneNumber,
        fingerPrint: state.fingerPrint,
        type: 'NewRegistration',
        registrationSessionId: event.registrationSessionId,
      };

    case 'login_process.completed':
      return {
        id: state.id,
        phoneNumber: state.phoneNumber,
        fingerPrint: state.fingerPrint,
        type: 'Success',
        userId: event.userId,
      };

    case 'login_process.registration_completed':
      return {
        id: state.id,
        phoneNumber: state.phoneNumber,
        fingerPrint: state.fingerPrint,
        type: 'Success',
        userId: event.userId,
      };

    default:
      assertNever(event);
  }
};

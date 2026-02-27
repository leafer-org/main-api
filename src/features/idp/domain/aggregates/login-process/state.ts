import type { FingerPrint } from '../../vo/finger-print.js';
import type { OtpCodeHash } from '../../vo/otp.js';
import type { PhoneNumber } from '../../vo/phone-number.js';
import type { EntityId } from '@/infra/ddd/entity.js';
import type { UserId } from '@/kernel/domain/ids.js';

export type LoginProcessId = EntityId<'LoginProcess'>;

type LoginProcessStateBase = {
  id: LoginProcessId;
  phoneNumber: PhoneNumber;
  fingerPrint: FingerPrint;
};

export type RequestedLoginProcessState = LoginProcessStateBase & {
  type: 'OtpRequested';
  codeHash: OtpCodeHash;
  expiresAt: Date;
  verifyAttempts: number;
  requestedAt: Date;
  lastTryAt?: Date | undefined;
};

type NewRegistrationLoginProcessState = LoginProcessStateBase & {
  type: 'NewRegistration';
  registrationSessionId: string;
};

type SuccessLoginProcessState = LoginProcessStateBase & {
  type: 'Success';
  userId: UserId;
};

type BlockedLoginProcessState = LoginProcessStateBase & {
  type: 'Blocked';
  blockedUntil: Date;
};

type LoginProcessErroredState = LoginProcessStateBase & {
  type: 'Errored';
  error: 'otp_expired';
};

export type LoginProcessState =
  | RequestedLoginProcessState
  | NewRegistrationLoginProcessState
  | SuccessLoginProcessState
  | BlockedLoginProcessState
  | LoginProcessErroredState;

// Состояние которое уже ничего не значит и надо перейти в начало)
export function isTerminalState(state: LoginProcessState, now: Date): boolean {
  if (state.type === 'Success') return true;
  if (state.type === 'Errored') return true;
  if (state.type === 'Blocked' && !isActivelyBlocked(state, now)) return true;
  if (isOtpExpired(state, now)) return true;
  return false;
}

export function isActivelyBlocked(state: BlockedLoginProcessState, now: Date): boolean {
  return state.blockedUntil > now;
}

export function isOtpExpired(state: LoginProcessState, now: Date): boolean {
  return state.type === 'OtpRequested' && state.expiresAt <= now;
}

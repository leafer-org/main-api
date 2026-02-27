import type { FingerPrint } from '../../vo/finger-print.js';
import type { FullName } from '../../vo/full-name.js';
import type { OtpCode } from '../../vo/otp.js';
import type { PhoneNumber } from '../../vo/phone-number.js';
import type { LoginProcessId } from './state.js';
import type { FileId, UserId } from '@/kernel/domain/ids.js';
import type { Role } from '@/kernel/domain/vo.js';

export type LoginProcessStartedEvent = {
  type: 'login_process.started';
  id: LoginProcessId;
  otpCode: OtpCode;
  phoneNumber: PhoneNumber;
  fingerPrint: FingerPrint;
  accuredAt: Date;
  lastProcessId: LoginProcessId | null;
};

export type OtpExpiredEvent = {
  type: 'login_process.otp_expired';
};

export type OtpVerifyFailedEvent = {
  type: 'login_process.otp_verify_failed';
  lastTryAt: Date;
};

export type LoginProcessBlockedEvent = {
  type: 'login_process.blocked';
  blockedUntil: Date;
};

export type NewRegistrationStartedEvent = {
  type: 'login_process.new_registration';
  registrationSessionId: string;
};

export type LoginCompletedEvent = {
  type: 'login_process.completed';
  userId: UserId;
  role: Role;
  fingerPrint: FingerPrint;
};

export type RegistrationCompletedEvent = {
  type: 'login_process.registration_completed';
  userId: UserId;
  role: Role;
  fingerPrint: FingerPrint;
  phoneNumber: PhoneNumber;
  fullName: FullName;
  avatarId: FileId | undefined;
};

export type LoginProcessEvent =
  | LoginProcessStartedEvent
  | OtpExpiredEvent
  | OtpVerifyFailedEvent
  | LoginProcessBlockedEvent
  | NewRegistrationStartedEvent
  | LoginCompletedEvent
  | RegistrationCompletedEvent;

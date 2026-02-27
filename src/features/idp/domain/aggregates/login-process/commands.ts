import type { FingerPrint } from '../../vo/finger-print.js';
import type { FullName } from '../../vo/full-name.js';
import type { OtpCode } from '../../vo/otp.js';
import type { PhoneNumber } from '../../vo/phone-number.js';
import type { EntityId } from '@/infra/ddd/entity.js';
import type { EventId } from '@/infra/ddd/event.js';
import type { FileId, UserId } from '@/kernel/domain/ids.js';
import type { Role } from '@/kernel/domain/vo.js';

export type LoginProcessId = EntityId<'LoginProcess'>;

export type CreateOtpCommand = {
  type: 'CreateOtp';
  newLoginProcessId: LoginProcessId;
  now: Date;
  phoneNumber: PhoneNumber;
  otpCode: OtpCode;
  fingerPrint: FingerPrint;
};

export type VerifyOtpCommand = {
  type: 'VerifyOtp';
  otpCode: OtpCode;
  now: Date;
  registrationSessionId: string;
  user: { id: UserId; role: Role } | undefined;
  generateEventId: () => EventId;
};

export type RegisterCommand = {
  type: 'Register';
  newUserId: UserId;
  role: Role;
  fullName: FullName;
  avatarId: FileId | undefined;

  registrationSessionId: string;
  fingerPrint: FingerPrint;
  now: Date;
  createEventId: () => EventId;
};

export type LoginProcessCommand = CreateOtpCommand | VerifyOtpCommand | RegisterCommand;

import type { FullName } from '../../vo/full-name.js';
import type { PhoneNumber } from '../../vo/phone-number.js';
import type { MediaId, UserId } from '@/kernel/domain/ids.js';
import type { Role } from '@/kernel/domain/vo/role.js';

export type UserState = {
  id: UserId;
  phoneNumber: PhoneNumber;
  fullName: FullName;
  avatarId: MediaId | undefined;
  role: Role;
  cityId: string;
  lat?: number;
  lng?: number;
  blockedAt: Date | undefined;
  blockReason: string | undefined;
  createdAt: Date;
  updatedAt: Date;
};

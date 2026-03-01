import type { FullName } from '../../vo/full-name.js';
import type { PhoneNumber } from '../../vo/phone-number.js';
import type { FileId, UserId } from '@/kernel/domain/ids.js';
import type { Role } from '@/kernel/domain/vo/role.js';

export type UserState = {
  id: UserId;
  phoneNumber: PhoneNumber;
  fullName: FullName;
  avatarId: FileId | undefined;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
};

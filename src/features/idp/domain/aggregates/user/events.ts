import type { FullName } from '../../vo/full-name.js';
import type { PhoneNumber } from '../../vo/phone-number.js';
import type { FileId, UserId } from '@/kernel/domain/ids.js';
import type { Role } from '@/kernel/domain/vo/role.js';

export type UserCreatedEvent = {
  type: 'user.created';
  id: UserId;
  phoneNumber: PhoneNumber;
  fullName: FullName;
  avatarId: FileId | undefined;
  role: Role;
  createdAt: Date;
};

export type UserProfileUpdatedEvent = {
  type: 'user.profile_updated';
  fullName: FullName;
  avatarId: FileId | undefined;
  updatedAt: Date;
};

export type UserRoleUpdatedEvent = {
  type: 'user.role_updated';
  userId: UserId;
  role: Role;
  updatedAt: Date;
};

export type UserEvent = UserCreatedEvent | UserProfileUpdatedEvent | UserRoleUpdatedEvent;

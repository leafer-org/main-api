import type { FullName } from '../../vo/full-name.js';
import type { PhoneNumber } from '../../vo/phone-number.js';
import type { UserId } from '@/kernel/domain/ids.js';
import type { Role } from '@/kernel/domain/vo.js';

export type UserCreatedEvent = {
  type: 'user.created';
  id: UserId;
  phoneNumber: PhoneNumber;
  fullName: FullName;
  role: Role;
  createdAt: Date;
};

export type UserProfileUpdatedEvent = {
  type: 'user.profile_updated';
  fullName: FullName;
  updatedAt: Date;
};

export type UserRoleUpdatedEvent = {
  type: 'user.role_updated';
  userId: UserId;
  role: Role;
  updatedAt: Date;
};

export type UserEvent = UserCreatedEvent | UserProfileUpdatedEvent | UserRoleUpdatedEvent;

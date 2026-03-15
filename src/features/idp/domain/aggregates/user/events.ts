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
  cityId: string;
  lat?: number;
  lng?: number;
  createdAt: Date;
};

export type UserProfileUpdatedEvent = {
  type: 'user.profile_updated';
  fullName: FullName;
  avatarId: FileId | undefined;
  cityId?: string;
  lat?: number;
  lng?: number;
  updatedAt: Date;
};

export type UserRoleUpdatedEvent = {
  type: 'user.role_updated';
  userId: UserId;
  role: Role;
  updatedAt: Date;
};

export type UserBlockedEvent = {
  type: 'user.blocked';
  userId: UserId;
  reason: string;
  blockedAt: Date;
};

export type UserUnblockedEvent = {
  type: 'user.unblocked';
  userId: UserId;
  unblockedAt: Date;
};

export type UserEvent =
  | UserCreatedEvent
  | UserProfileUpdatedEvent
  | UserRoleUpdatedEvent
  | UserBlockedEvent
  | UserUnblockedEvent;

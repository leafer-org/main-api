import type { FullName } from '../../vo/full-name.js';
import type { PhoneNumber } from '../../vo/phone-number.js';
import type { FileId, UserId } from '@/kernel/domain/ids.js';
import type { Role } from '@/kernel/domain/vo/role.js';

export type CreateUserCommand = {
  type: 'CreateUser';
  id: UserId;
  phoneNumber: PhoneNumber;
  fullName: FullName;
  avatarId: FileId | undefined;
  role: Role;
  cityId: string;
  lat?: number;
  lng?: number;
  now: Date;
};

export type UpdateProfileCommand = {
  type: 'UpdateProfile';
  fullName: FullName;
  avatarId: FileId | undefined;
  cityId?: string;
  lat?: number;
  lng?: number;
  now: Date;
};

export type UpdateUserRoleCommand = {
  type: 'UpdateUserRole';
  role: Role;
  now: Date;
};

export type UserCommand = CreateUserCommand | UpdateProfileCommand | UpdateUserRoleCommand;

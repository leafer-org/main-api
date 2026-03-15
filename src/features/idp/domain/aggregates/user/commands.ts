import type { FullName } from '../../vo/full-name.js';
import type { PhoneNumber } from '../../vo/phone-number.js';
import type { MediaId, UserId } from '@/kernel/domain/ids.js';
import type { Role } from '@/kernel/domain/vo/role.js';

export type CreateUserCommand = {
  type: 'CreateUser';
  id: UserId;
  phoneNumber: PhoneNumber;
  fullName: FullName;
  avatarId: MediaId | undefined;
  role: Role;
  cityId: string;
  lat?: number;
  lng?: number;
  now: Date;
};

export type UpdateProfileCommand = {
  type: 'UpdateProfile';
  fullName: FullName;
  avatarId: MediaId | undefined;
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

export type BlockUserCommand = {
  type: 'BlockUser';
  reason: string;
  now: Date;
};

export type UnblockUserCommand = {
  type: 'UnblockUser';
  now: Date;
};

export type UserCommand =
  | CreateUserCommand
  | UpdateProfileCommand
  | UpdateUserRoleCommand
  | BlockUserCommand
  | UnblockUserCommand;

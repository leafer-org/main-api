import type { FullName } from '../../vo/full-name.js';
import type { PhoneNumber } from '../../vo/phone-number.js';
import type { UserId } from '@/kernel/domain/ids.js';
import type { Role } from '@/kernel/domain/vo.js';

export type CreateUserCommand = {
  type: 'CreateUser';
  id: UserId;
  phoneNumber: PhoneNumber;
  fullName: FullName;
  role: Role;
  now: Date;
};

export type UpdateProfileCommand = {
  type: 'UpdateProfile';
  fullName: FullName;
  now: Date;
};

export type UserCommand = CreateUserCommand | UpdateProfileCommand;

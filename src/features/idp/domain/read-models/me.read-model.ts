import type { FullName } from '../vo/full-name.js';
import type { PhoneNumber } from '../vo/phone-number.js';
import type { MediaId, SessionId, UserId } from '@/kernel/domain/ids.js';
import type { Role } from '@/kernel/domain/vo/role.js';

export type MeReadModel = {
  userId: UserId;
  role: Role;
  sessionId: SessionId;
  fullName: FullName;
  phoneNumber: PhoneNumber;
  cityId: string;
  lat: number | undefined;
  lng: number | undefined;
  createdAt: Date;
  updatedAt: Date;
  avatarId: MediaId | undefined;
};

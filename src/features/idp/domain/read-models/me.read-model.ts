import type { FullName } from '../vo/full-name.js';
import type { FileId, SessionId, UserId } from '@/kernel/domain/ids.js';
import type { Role } from '@/kernel/domain/vo.js';

export type MeReadModel = {
  userId: UserId;
  role: Role;
  sessionId: SessionId;
  fullName: FullName;
  avatarId: FileId | undefined;
};

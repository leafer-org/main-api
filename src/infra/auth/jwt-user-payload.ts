import type { SessionId, UserId } from '@/kernel/domain/ids.js';
import type { Role } from '@/kernel/domain/vo.js';

export type JwtUserPayload = {
  userId: UserId;
  role: Role;
  sessionId: SessionId;
};

import type { SessionId, UserId } from '@/kernel/domain/ids.js';

export type SessionState = {
  id: SessionId;
  userId: UserId;
  createdAt: Date;
  expiresAt: Date;
};

import type { SessionMeta } from '../../vo/session-meta.js';
import type { SessionId, UserId } from '@/kernel/domain/ids.js';

export type SessionState = {
  id: SessionId;
  userId: UserId;
  createdAt: Date;
  expiresAt: Date;
  meta: SessionMeta;
};

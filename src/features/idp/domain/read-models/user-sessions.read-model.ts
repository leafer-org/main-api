import type { SessionId, UserId } from '@/kernel/domain/ids.js';

export type UserSessionReadModel = {
  id: SessionId;
  createdAt: Date;
  expiresAt: Date;
};

export type UserSessionsReadModel = {
  userId: UserId;
  sessions: UserSessionReadModel[];
};

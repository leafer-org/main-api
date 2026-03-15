import type { SessionId, UserId } from '@/kernel/domain/ids.js';

export type UserSessionReadModel = {
  id: SessionId;
  createdAt: Date;
  expiresAt: Date;
  ip: string | null;
  city: string | null;
  country: string | null;
  deviceName: string | null;
};

export type UserSessionsReadModel = {
  userId: UserId;
  sessions: UserSessionReadModel[];
};

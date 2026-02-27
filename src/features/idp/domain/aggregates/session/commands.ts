import type { SessionId, UserId } from '@/kernel/domain/ids.js';

export type CreateSessionCommand = {
  type: 'CreateSession';
  id: SessionId;
  userId: UserId;
  now: Date;
  ttlMs: number;
};

export type RotateSessionCommand = {
  type: 'RotateSession';
  newId: SessionId;
  userId: UserId;
  now: Date;
  ttlMs: number;
};

export type DeleteSessionCommand = {
  type: 'DeleteSession';
};

export type SessionCommand = CreateSessionCommand | RotateSessionCommand | DeleteSessionCommand;

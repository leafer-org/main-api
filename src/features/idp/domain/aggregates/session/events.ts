import type { SessionMeta } from '../../vo/session-meta.js';
import type { SessionId, UserId } from '@/kernel/domain/ids.js';

export type SessionCreatedEvent = {
  type: 'session.created';
  id: SessionId;
  userId: UserId;
  createdAt: Date;
  expiresAt: Date;
  meta: SessionMeta;
};

export type SessionRotatedEvent = {
  type: 'session.rotated';
  newId: SessionId;
  userId: UserId;
  createdAt: Date;
  expiresAt: Date;
  meta: SessionMeta;
};

export type SessionDeletedEvent = {
  type: 'session.deleted';
};

export type SessionEvent = SessionCreatedEvent | SessionRotatedEvent | SessionDeletedEvent;

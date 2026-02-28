import type { EntityId } from '@/infra/ddd/entity.js';

export type FileId = EntityId<'File'>;
export type UserId = EntityId<'User'>;
export type SessionId = EntityId<'Session'>;

export const FileId = {
  raw(id: string): FileId {
    return id as FileId;
  },
};

export const UserId = {
  raw(id: string): UserId {
    return id as UserId;
  },
};

export const SessionId = {
  raw(id: string): SessionId {
    return id as SessionId;
  },
};

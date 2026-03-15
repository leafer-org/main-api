import type { MediaId, UserId } from '../ids.js';

export type UserCreatedEvent = {
  type: 'user.created';
  userId: UserId;
  name: string;
  avatarId: MediaId | null;
  createdAt: Date;
};

export type UserUpdatedEvent = {
  type: 'user.updated';
  userId: UserId;
  name: string;
  avatarId: MediaId | null;
  updatedAt: Date;
};

export type UserDeletedEvent = {
  type: 'user.deleted';
  userId: UserId;
  deletedAt: Date;
};

export type UserIntegrationEvent = UserCreatedEvent | UserUpdatedEvent | UserDeletedEvent;

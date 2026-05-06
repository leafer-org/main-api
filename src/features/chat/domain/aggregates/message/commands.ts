import type { MediaId, UserId } from '@/kernel/domain/ids.js';

export type EditMessageCommand = Readonly<{
  type: 'EditMessage';
  actorUserId: UserId;
  text: string | null;
  mediaIds: readonly MediaId[];
  now: Date;
}>;

export type DeleteMessageCommand = Readonly<{
  type: 'DeleteMessage';
  actorUserId: UserId;
  now: Date;
}>;

export type MessageCommand = EditMessageCommand | DeleteMessageCommand;

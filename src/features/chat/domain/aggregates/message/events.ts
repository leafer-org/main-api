import type { ChatId, ChatMessageId, MediaId, UserId } from '@/kernel/domain/ids.js';

export type MessageEditedEvent = Readonly<{
  type: 'chat.message.edited';
  chatId: ChatId;
  messageId: ChatMessageId;
  actorUserId: UserId;
  text: string | null;
  mediaIds: readonly MediaId[];
  editedAt: Date;
}>;

export type MessageDeletedEvent = Readonly<{
  type: 'chat.message.deleted';
  chatId: ChatId;
  messageId: ChatMessageId;
  actorUserId: UserId;
  deletedAt: Date;
}>;

export type MessageEvent = MessageEditedEvent | MessageDeletedEvent;

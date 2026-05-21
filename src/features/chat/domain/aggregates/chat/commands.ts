import type { MessageAttachment } from '../../vo/message-attachment.js';
import type { MessageKind } from '../../vo/message-kind.js';
import type { ParticipantKind } from '../../vo/participant-kind.js';
import type {
  ChatId,
  ChatMessageId,
  ChatParticipantId,
  MediaId,
  UserId,
} from '@/kernel/domain/ids.js';

export type NewParticipantSpec = Readonly<{
  id: ChatParticipantId;
  kind: ParticipantKind;
  subjectId: string | null;
  assignedUserId: UserId | null;
}>;

export type NewMessageSpec = Readonly<{
  messageId: ChatMessageId;
  senderParticipantId: ChatParticipantId;
  kind: Exclude<MessageKind, 'system'>;
  text: string | null;
  mediaIds: readonly MediaId[];
  attachments: readonly MessageAttachment[];
}>;

export type OpenChatCommand = Readonly<{
  type: 'OpenChat';
  chatId: ChatId;
  participants: readonly NewParticipantSpec[];
  firstMessage: NewMessageSpec;
  now: Date;
}>;

export type SendMessageCommand = Readonly<{
  type: 'SendMessage';
  message: NewMessageSpec;
  now: Date;
}>;

export type ClaimSlotCommand = Readonly<{
  type: 'ClaimSlot';
  participantId: ChatParticipantId;
  userId: UserId;
  systemMessageId: ChatMessageId;
  now: Date;
}>;

export type ReleaseSlotCommand = Readonly<{
  type: 'ReleaseSlot';
  participantId: ChatParticipantId;
  systemMessageId: ChatMessageId;
  now: Date;
}>;

export type ReassignSlotCommand = Readonly<{
  type: 'ReassignSlot';
  participantId: ChatParticipantId;
  newAssigneeUserId: UserId;
  systemMessageId: ChatMessageId;
  now: Date;
}>;

export type BlockChatCommand = Readonly<{
  type: 'BlockChat';
  byParticipantId: ChatParticipantId;
  reason: string | null;
  systemMessageId: ChatMessageId;
  now: Date;
}>;

export type UnblockChatCommand = Readonly<{
  type: 'UnblockChat';
  byParticipantId: ChatParticipantId;
  systemMessageId: ChatMessageId;
  now: Date;
}>;

export type MarkReadCommand = Readonly<{
  type: 'MarkRead';
  participantId: ChatParticipantId;
  readerUserId: UserId;
  upToMessageId: ChatMessageId;
  now: Date;
}>;

export type ChatCommand =
  | OpenChatCommand
  | SendMessageCommand
  | ClaimSlotCommand
  | ReleaseSlotCommand
  | ReassignSlotCommand
  | BlockChatCommand
  | UnblockChatCommand
  | MarkReadCommand;

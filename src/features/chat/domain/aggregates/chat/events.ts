import type { MessageAttachment } from '../../vo/message-attachment.js';
import type { MessageKind, SystemEvent } from '../../vo/message-kind.js';
import type { ParticipantKind } from '../../vo/participant-kind.js';
import type {
  ChatId,
  ChatMessageId,
  ChatParticipantId,
  MediaId,
  UserId,
} from '@/kernel/domain/ids.js';

export type ChatOpenedEvent = Readonly<{
  type: 'chat.opened';
  chatId: ChatId;
  participants: ReadonlyArray<{
    id: ChatParticipantId;
    kind: ParticipantKind;
    subjectId: string | null;
    assignedUserId: UserId | null;
  }>;
  initiatorParticipantId: ChatParticipantId;
  openedAt: Date;
}>;

export type ChatMessageSentEvent = Readonly<{
  type: 'chat.message.sent';
  chatId: ChatId;
  messageId: ChatMessageId;
  senderParticipantId: ChatParticipantId | null;
  kind: MessageKind;
  text: string | null;
  mediaIds: readonly MediaId[];
  attachments: readonly MessageAttachment[];
  systemEvent: SystemEvent | null;
  createdAt: Date;
}>;

export type SlotClaimedEvent = Readonly<{
  type: 'chat.slot.claimed';
  chatId: ChatId;
  participantId: ChatParticipantId;
  userId: UserId;
  claimedAt: Date;
}>;

export type SlotReleasedEvent = Readonly<{
  type: 'chat.slot.released';
  chatId: ChatId;
  participantId: ChatParticipantId;
  oldAssigneeUserId: UserId;
  releasedAt: Date;
}>;

export type SlotReassignedEvent = Readonly<{
  type: 'chat.slot.reassigned';
  chatId: ChatId;
  participantId: ChatParticipantId;
  oldAssigneeUserId: UserId;
  newAssigneeUserId: UserId;
  reassignedAt: Date;
}>;

export type ChatBlockedEvent = Readonly<{
  type: 'chat.blocked';
  chatId: ChatId;
  byParticipantId: ChatParticipantId;
  reason: string | null;
  blockedAt: Date;
}>;

export type ChatUnblockedEvent = Readonly<{
  type: 'chat.unblocked';
  chatId: ChatId;
  byParticipantId: ChatParticipantId;
  unblockedAt: Date;
}>;

export type ChatReadEvent = Readonly<{
  type: 'chat.read';
  chatId: ChatId;
  participantId: ChatParticipantId;
  /** Кто из user'ов отметил как прочитанное (per-user cursor). */
  readerUserId: UserId;
  /** Kind slot'а, через который было выполнено mark-read. */
  slotKind: ParticipantKind;
  upToMessageId: ChatMessageId;
  readAt: Date;
}>;

export type ChatEvent =
  | ChatOpenedEvent
  | ChatMessageSentEvent
  | SlotClaimedEvent
  | SlotReleasedEvent
  | SlotReassignedEvent
  | ChatBlockedEvent
  | ChatUnblockedEvent
  | ChatReadEvent;

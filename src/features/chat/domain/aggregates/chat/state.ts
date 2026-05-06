import type { ParticipantKind } from '../../vo/participant-kind.js';
import type { EntityState } from '@/infra/ddd/entity-state.js';
import type {
  ChatId,
  ChatMessageId,
  ChatParticipantId,
  ItemId,
  UserId,
} from '@/kernel/domain/ids.js';

export type ChatStatus = 'open' | 'closed' | 'blocked';

export type ChatParticipant = Readonly<{
  id: ChatParticipantId;
  kind: ParticipantKind;
  subjectId: string | null;
  assignedUserId: UserId | null;
  claimedAt: Date | null;
  lastReadMessageId: ChatMessageId | null;
  createdAt: Date;
}>;

export type LastMessageSnapshot = Readonly<{
  messageId: ChatMessageId;
  preview: string;
  senderParticipantId: ChatParticipantId | null;
  createdAt: Date;
}>;

export type ChatState = EntityState<{
  chatId: ChatId;
  status: ChatStatus;
  blockedByParticipantId: ChatParticipantId | null;
  blockedAt: Date | null;
  contextItemId: ItemId | null;
  participants: ChatParticipant[];
  lastMessage: LastMessageSnapshot | null;
  createdAt: Date;
  updatedAt: Date;
}>;

import type { ParticipantKind } from '../../vo/participant-kind.js';
import type { EntityState } from '@/infra/ddd/entity-state.js';
import type {
  ChatId,
  ChatMessageId,
  ChatParticipantId,
  UserId,
} from '@/kernel/domain/ids.js';

export type ChatStatus = 'open' | 'blocked';

/**
 * Slot участника. Per-user lastReadMessageId хранится в отдельной таблице
 * `chat_participant_user_reads(participant_id, user_id, ...)` — это позволяет
 * member'ам организации иметь персональные курсоры внутри одного org-slot'а.
 */
export type ChatParticipant = Readonly<{
  id: ChatParticipantId;
  kind: ParticipantKind;
  subjectId: string | null;
  assignedUserId: UserId | null;
  claimedAt: Date | null;
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
  participants: ChatParticipant[];
  lastMessage: LastMessageSnapshot | null;
  createdAt: Date;
  updatedAt: Date;
}>;

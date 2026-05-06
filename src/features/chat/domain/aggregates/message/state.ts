import type { MessageKind, SystemEvent } from '../../vo/message-kind.js';
import type { EntityState } from '@/infra/ddd/entity-state.js';
import type {
  ChatId,
  ChatMessageId,
  ChatParticipantId,
  MediaId,
  UserId,
} from '@/kernel/domain/ids.js';

export type MessageState = EntityState<{
  messageId: ChatMessageId;
  chatId: ChatId;
  senderParticipantId: ChatParticipantId | null;
  actorUserId: UserId | null;
  kind: MessageKind;
  text: string | null;
  mediaIds: readonly MediaId[];
  systemEvent: SystemEvent | null;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
}>;

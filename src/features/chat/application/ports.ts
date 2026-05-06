import type { ChatState } from '../domain/aggregates/chat/state.js';
import type { ChatEvent } from '../domain/aggregates/chat/events.js';
import type { MessageState } from '../domain/aggregates/message/state.js';
import type { MessageEvent } from '../domain/aggregates/message/events.js';
import type { ParticipantKind } from '../domain/vo/participant-kind.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type {
  ChatId,
  ChatMessageId,
  ChatParticipantId,
  OrganizationId,
  UserId,
} from '@/kernel/domain/ids.js';

// --- Aggregate repository ports (write-side, transactional) ---

export abstract class ChatRepository {
  public abstract findById(tx: Transaction, chatId: ChatId): Promise<ChatState | null>;
  public abstract findByPairKey(tx: Transaction, pairKey: string): Promise<ChatState | null>;
  public abstract save(tx: Transaction, state: ChatState, pairKey: string): Promise<void>;
}

export abstract class MessageRepository {
  public abstract findById(
    tx: Transaction,
    messageId: ChatMessageId,
  ): Promise<MessageState | null>;
  public abstract save(tx: Transaction, state: MessageState): Promise<void>;
}

// --- ID generator ---

export abstract class ChatIdGenerator {
  public abstract generateChatId(): ChatId;
  public abstract generateParticipantId(): ChatParticipantId;
  public abstract generateMessageId(): ChatMessageId;
}

// --- Slot pool resolver (extensible per-kind authorization) ---

export abstract class SlotPoolResolver {
  /**
   * Может ли userId занять (claim'нуть) слот {kind, subjectId}?
   * - 'user'         — userId == subjectId
   * - 'organization' — userId — сотрудник орг с правом chat.respond.organization
   * - 'support'      — userId — админ с правом chat.respond.support
   */
  public abstract canAssign(
    kind: ParticipantKind,
    subjectId: string | null,
    userId: UserId,
  ): Promise<boolean>;

  /**
   * Все userId, способные занять данный слот.
   * Используется для маршрутизации уведомлений и расчёта shared inbox.
   */
  public abstract pool(kind: ParticipantKind, subjectId: string | null): Promise<UserId[]>;
}

// --- Chat-local read-model port (asynchronous projection from organization events) ---
//
// ТОЛЬКО для list-запросов (operator chat list, notifications routing).
// Eventually consistent проекция от события organization.respondability-changed.
//
// Для write-path авторизации (claim/send/open chat) использовать
// OrganizationRespondabilityPort из kernel — там свежие данные и логика.

export abstract class ChatOrganizationMembershipReadModel {
  /**
   * Все organizationId'ы, в которых userId сейчас может отвечать как орг.
   * Используется для фильтра operator chat list.
   */
  public abstract findOrganizationsWhereUserCanRespond(
    userId: UserId,
  ): Promise<OrganizationId[]>;

  /**
   * Все userId'ы, которые сейчас могут отвечать от лица данной орг.
   * Используется для маршрутизации уведомлений и расчёта shared inbox.
   */
  public abstract findUsersWhoCanRespondAs(orgId: OrganizationId): Promise<UserId[]>;
}

// --- Event publisher (Outbox → Kafka → Centrifugo bridge) ---

export abstract class ChatEventPublisher {
  public abstract publish(tx: Transaction, event: ChatEvent | MessageEvent): Promise<void>;
}

// --- Read-model query ports ---

export type ChatListItem = {
  chatId: ChatId;
  status: 'open' | 'closed' | 'blocked';
  participants: ReadonlyArray<{
    id: ChatParticipantId;
    kind: 'user' | 'organization' | 'support';
    subjectId: string | null;
    assignedUserId: UserId | null;
  }>;
  contextItemId: string | null;
  lastMessage: {
    messageId: ChatMessageId;
    preview: string;
    senderParticipantId: ChatParticipantId | null;
    createdAt: Date;
  } | null;
  myUnreadCount: number;
  updatedAt: Date;
};

export type ChatMessageItem = {
  messageId: ChatMessageId;
  chatId: ChatId;
  senderParticipantId: ChatParticipantId | null;
  kind: 'text' | 'media' | 'system';
  text: string | null;
  mediaIds: readonly string[];
  systemEvent: { type: string; payload: Record<string, unknown> } | null;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
};

export type ChatListPage = {
  chats: ChatListItem[];
  total: number;
};

export type ChatMessagesPage = {
  messages: ChatMessageItem[];
  nextCursor: string | null;
};

export type AdminChatFilters = {
  slotKind?: 'organization' | 'support';
  orgId?: string;
  status?: 'open' | 'closed' | 'blocked';
  assignedToMe?: boolean;
  unassigned?: boolean;
};

export abstract class ChatListQueryPort {
  public abstract findClientChats(
    userId: UserId,
    params?: { from?: number; size?: number },
  ): Promise<ChatListPage>;

  public abstract findOperatorChats(
    userId: UserId,
    filters: AdminChatFilters,
    params?: { from?: number; size?: number },
  ): Promise<ChatListPage>;
}

export abstract class ChatDetailQueryPort {
  public abstract findById(
    chatId: ChatId,
    requesterUserId: UserId,
  ): Promise<ChatListItem | null>;
}

export abstract class ChatMessagesQueryPort {
  public abstract findMessages(
    chatId: ChatId,
    requesterUserId: UserId,
    params?: { cursor?: string; limit?: number },
  ): Promise<ChatMessagesPage>;
}

export type UnreadSummary = {
  totalUnreadCount: number;
  perChat: Array<{ chatId: ChatId; count: number }>;
};

export abstract class UnreadSummaryQueryPort {
  public abstract findUnread(userId: UserId): Promise<UnreadSummary>;
}

export type ChatSearchHit = {
  messageId: ChatMessageId;
  chatId: ChatId;
  snippet: string;
  highlightedText: string;
  senderParticipantId: ChatParticipantId | null;
  senderUserId: UserId | null;
  senderKind: 'user' | 'organization' | 'support' | null;
  createdAt: Date;
};

export type ChatSearchPreview = {
  partyOther: { kind: 'user' | 'organization' | 'support'; subjectId: string | null };
  contextItemId: string | null;
};

export type ChatSearchResultGlobal = {
  results: Array<ChatSearchHit & { chatPreview: ChatSearchPreview | null }>;
  nextCursor: string | null;
};

export type ChatSearchResultInChat = {
  results: ChatSearchHit[];
  nextCursor: string | null;
};

export type OperatorSearchFilters = {
  slotKind?: 'organization' | 'support';
  orgId?: string;
  status?: 'open' | 'closed' | 'blocked';
  from?: Date;
  to?: Date;
};

export abstract class ChatSearchQueryPort {
  /**
   * Поиск по чатам, в которых current user — client (kind='user').
   * Глобальный режим: chatId не задан → все клиентские чаты.
   * В пределах чата: chatId задан → только этот чат, с проверкой видимости.
   */
  public abstract searchForUser(
    userId: UserId,
    params: { q: string; chatId?: ChatId; cursor?: string; limit?: number },
  ): Promise<ChatSearchResultGlobal | ChatSearchResultInChat>;

  /**
   * Поиск для оператора по чатам с operator-слотами (org/support),
   * в пуле которых состоит current user, плюс уже claim'нутые им.
   * Возвращает 'no_chat_access' если ни один pool не доступен.
   */
  public abstract searchForOperator(
    userId: UserId,
    isSupport: boolean,
    memberOrgIds: readonly string[],
    params: {
      q: string;
      chatId?: ChatId;
      filters?: OperatorSearchFilters;
      cursor?: string;
      limit?: number;
    },
  ): Promise<ChatSearchResultGlobal | ChatSearchResultInChat>;
}

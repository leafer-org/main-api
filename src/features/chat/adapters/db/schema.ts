import { index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const chats = pgTable(
  'chats',
  {
    id: uuid('id').primaryKey(),
    pairKey: text('pair_key').notNull().unique(),
    status: text('status').notNull(),
    blockedByParticipantId: uuid('blocked_by_participant_id'),
    blockedAt: timestamp('blocked_at', { withTimezone: true }),
    contextItemId: text('context_item_id'),
    lastMessageId: uuid('last_message_id'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    lastMessagePreview: text('last_message_preview'),
    lastMessageSenderParticipantId: uuid('last_message_sender_participant_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('chats_status_idx').on(table.status),
    index('chats_last_message_at_idx').on(table.lastMessageAt),
  ],
);

export const chatParticipants = pgTable(
  'chat_participants',
  {
    id: uuid('id').primaryKey(),
    chatId: uuid('chat_id').notNull(),
    kind: text('kind').notNull(),
    subjectId: text('subject_id'),
    assignedUserId: text('assigned_user_id'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('chat_participants_chat_id_idx').on(table.chatId),
    index('chat_participants_kind_subject_idx').on(table.kind, table.subjectId),
    index('chat_participants_assigned_user_idx').on(table.assignedUserId),
  ],
);

/**
 * Per-user read cursor для каждого слота. Заполняется обработчиком
 * `chat.read` события из outbox/Kafka — ON CONFLICT с защитой от
 * out-of-order доставки (compare last_read_at).
 *
 * Семантика unread: для slot.id и user.id берётся cursor.last_read_message_id;
 * unread считаются сообщения с created_at > курсорное created_at.
 * Для user-slot'а cursor имеет один user_id == subject_id.
 * Для org-slot'а — у каждого member организации свой row.
 */
export const chatParticipantUserReads = pgTable(
  'chat_participant_user_reads',
  {
    participantId: uuid('participant_id').notNull(),
    userId: text('user_id').notNull(),
    lastReadMessageId: uuid('last_read_message_id').notNull(),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.participantId, table.userId] }),
    index('cpur_user_idx').on(table.userId),
  ],
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey(),
    chatId: uuid('chat_id').notNull(),
    senderParticipantId: uuid('sender_participant_id'),
    actorUserId: text('actor_user_id'),
    kind: text('kind').notNull(),
    text: text('text'),
    mediaIds: jsonb('media_ids').notNull().default([]),
    systemEvent: jsonb('system_event'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('chat_messages_chat_id_created_idx').on(table.chatId, table.createdAt),
    index('chat_messages_actor_user_idx').on(table.actorUserId),
  ],
);

/**
 * Локальная проекция «(orgId, userId) — этот user сейчас может отвечать
 * в чатах от лица данной орг». Поддерживается обработчиком
 * `organization.respondability-changed`, который дёргает kernel-порт
 * OrganizationRespondabilityPort и upsert/delete'ит запись.
 *
 * Используется ТОЛЬКО для list-запросов (operator chat list, notifications);
 * на write-path (claim/send) chat вызывает kernel-порт напрямую — там нужны
 * свежие данные, проекция eventually consistent.
 */
export const chatOrganizationMembers = pgTable(
  'chat_organization_members',
  {
    organizationId: text('organization_id').notNull(),
    userId: text('user_id').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId] }),
    index('chat_org_members_user_idx').on(table.userId),
  ],
);

export const chatReports = pgTable(
  'chat_reports',
  {
    id: uuid('id').primaryKey(),
    chatId: uuid('chat_id').notNull(),
    messageId: uuid('message_id'),
    reporterUserId: text('reporter_user_id').notNull(),
    reporterParticipantId: uuid('reporter_participant_id').notNull(),
    category: text('category'),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('chat_reports_chat_id_idx').on(table.chatId),
    index('chat_reports_message_id_idx').on(table.messageId),
    index('chat_reports_reporter_idx').on(table.reporterUserId),
  ],
);

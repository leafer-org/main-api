import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';

import {
  type AdminChatFilters,
  ChatDetailQueryPort,
  type ChatListItem,
  type ChatListPage,
  ChatListQueryPort,
  type ChatMessageItem,
  type ChatMessagesPage,
  ChatMessagesQueryPort,
  ChatOrganizationMembershipReadModel,
  type UnreadSummary,
  UnreadSummaryQueryPort,
} from '../../../application/ports.js';
import type { MessageKind, SystemEvent } from '../../../domain/vo/message-kind.js';
import type { ParticipantKind } from '../../../domain/vo/participant-kind.js';
import { chatMessages, chatParticipants, chats } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';
import {
  ChatId,
  ChatMessageId,
  ChatParticipantId,
  type UserId,
} from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

type CursorPayload = { createdAt: string; id: string };

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(raw: string): CursorPayload | null {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as CursorPayload;
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

@Injectable()
export class DrizzleChatQuery
  extends ChatListQueryPort
  implements ChatDetailQueryPort, ChatMessagesQueryPort, UnreadSummaryQueryPort
{
  public constructor(
    private readonly txHost: TransactionHostPg,
    @Inject(ChatOrganizationMembershipReadModel)
    private readonly orgMembership: ChatOrganizationMembershipReadModel,
    @Inject(PermissionCheckService)
    private readonly permissionCheck: PermissionCheckService,
  ) {
    super();
  }

  public async findClientChats(
    userId: UserId,
    params: { from?: number; size?: number } = {},
  ): Promise<ChatListPage> {
    const db = this.txHost.get(NO_TRANSACTION);
    const from = params.from ?? 0;
    const size = Math.min(params.size ?? DEFAULT_LIMIT, MAX_LIMIT);

    const chatIds = await db
      .select({ chatId: chatParticipants.chatId })
      .from(chatParticipants)
      .where(
        and(
          eq(chatParticipants.kind, 'user'),
          eq(chatParticipants.subjectId, userId as string),
        ),
      );

    if (chatIds.length === 0) return { chats: [], total: 0 };

    return this.listForChatIds(
      chatIds.map((c) => c.chatId),
      userId,
      from,
      size,
    );
  }

  public async findOperatorChats(
    userId: UserId,
    filters: AdminChatFilters,
    params: { from?: number; size?: number } = {},
  ): Promise<ChatListPage> {
    const db = this.txHost.get(NO_TRANSACTION);
    const from = params.from ?? 0;
    const size = Math.min(params.size ?? DEFAULT_LIMIT, MAX_LIMIT);

    // Через chat-local read-model вычисляем «к каким operator-слотам у user есть доступ»:
    //  • org-слоты с subject_id ∈ memberOrgIds (user — member этих орг)
    //  • support-слоты, если у user есть chat.respond.support
    //  • любые слоты, в которых user уже claim'нул (assigned_user_id = user)
    const [memberOrgIds, isSupportAdmin] = await Promise.all([
      this.orgMembership.findOrganizationsWhereUserCanRespond(userId),
      this.permissionCheck.can(Permission.ChatRespondAsSupport),
    ]);

    const memberOrgIdStrings = memberOrgIds.map((id) => id as string);

    const accessConditions = [eq(chatParticipants.assignedUserId, userId as string)];

    if (memberOrgIdStrings.length > 0) {
      accessConditions.push(
        and(
          eq(chatParticipants.kind, 'organization'),
          sql`${chatParticipants.subjectId} IN (${sql.join(
            memberOrgIdStrings.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        )!,
      );
    }
    if (isSupportAdmin) {
      accessConditions.push(eq(chatParticipants.kind, 'support'));
    }

    const accessFilter = or(...accessConditions);
    if (!accessFilter) return { chats: [], total: 0 };

    const filterConds: ReturnType<typeof and>[] = [];
    if (filters.slotKind) {
      filterConds.push(eq(chatParticipants.kind, filters.slotKind));
    }
    if (filters.orgId) {
      filterConds.push(eq(chatParticipants.subjectId, filters.orgId));
    }
    if (filters.assignedToMe) {
      filterConds.push(eq(chatParticipants.assignedUserId, userId as string));
    }
    if (filters.unassigned) {
      filterConds.push(sql`${chatParticipants.assignedUserId} IS NULL`);
    }

    const where = filterConds.length > 0 ? and(accessFilter, ...filterConds) : accessFilter;

    const distinctChatIds = await db
      .selectDistinct({ chatId: chatParticipants.chatId })
      .from(chatParticipants)
      .where(
        and(
          where,
          sql`${chatParticipants.kind} <> 'user'`,
        ),
      );

    let chatIdList = distinctChatIds.map((r) => r.chatId);

    if (filters.status && chatIdList.length > 0) {
      const statusFiltered = await db
        .select({ id: chats.id })
        .from(chats)
        .where(
          and(
            sql`${chats.id} IN (${sql.join(
              chatIdList.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})`,
            eq(chats.status, filters.status),
          ),
        );
      chatIdList = statusFiltered.map((r) => r.id);
    }

    if (chatIdList.length === 0) return { chats: [], total: 0 };
    return this.listForChatIds(chatIdList, userId, from, size);
  }

  public async findById(chatId: ChatId, requesterUserId: UserId): Promise<ChatListItem | null> {
    const items = await this.listForChatIds([chatId as string], requesterUserId, 0, 1);
    return items.chats[0] ?? null;
  }

  public async findMessages(
    chatId: ChatId,
    _requesterUserId: UserId,
    params: { cursor?: string; limit?: number } = {},
  ): Promise<ChatMessagesPage> {
    const db = this.txHost.get(NO_TRANSACTION);
    const limit = Math.min(params.limit ?? 50, MAX_LIMIT);

    const cursor = params.cursor ? decodeCursor(params.cursor) : null;
    if (params.cursor && !cursor) {
      throw new Error('invalid_cursor');
    }

    const rows = await db
      .select()
      .from(chatMessages)
      .where(
        cursor
          ? and(
              eq(chatMessages.chatId, chatId as string),
              or(
                lt(chatMessages.createdAt, new Date(cursor.createdAt)),
                and(
                  eq(chatMessages.createdAt, new Date(cursor.createdAt)),
                  lt(chatMessages.id, cursor.id),
                ),
              ),
            )
          : eq(chatMessages.chatId, chatId as string),
      )
      .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const messages: ChatMessageItem[] = page.map((row) => ({
      messageId: ChatMessageId.raw(row.id),
      chatId: ChatId.raw(row.chatId),
      senderParticipantId:
        row.senderParticipantId === null
          ? null
          : ChatParticipantId.raw(row.senderParticipantId),
      kind: row.kind as MessageKind,
      text: row.text,
      mediaIds: row.mediaIds as string[],
      systemEvent: row.systemEvent as SystemEvent | null,
      createdAt: row.createdAt,
      editedAt: row.editedAt,
      deletedAt: row.deletedAt,
    }));

    let nextCursor: string | null = null;
    if (hasMore) {
      const last = page[page.length - 1];
      if (last) {
        nextCursor = encodeCursor({
          createdAt: last.createdAt.toISOString(),
          id: last.id,
        });
      }
    }

    return { messages, nextCursor };
  }

  public async findUnread(userId: UserId): Promise<UnreadSummary> {
    const db = this.txHost.get(NO_TRANSACTION);

    const result = await db.execute<{ chat_id: string; cnt: number }>(sql`
      SELECT cp.chat_id AS chat_id, COUNT(m.id)::int AS cnt
      FROM chat_participants cp
      JOIN chat_messages m ON m.chat_id = cp.chat_id
      WHERE (
          (cp.kind = 'user' AND cp.subject_id = ${userId as string})
          OR cp.assigned_user_id = ${userId as string}
        )
        AND m.kind <> 'system'
        AND m.deleted_at IS NULL
        AND (m.sender_participant_id IS NULL OR m.sender_participant_id <> cp.id)
        AND (cp.last_read_message_id IS NULL OR m.id <> cp.last_read_message_id)
        AND (
          cp.last_read_message_id IS NULL
          OR m.created_at > (
            SELECT created_at FROM chat_messages WHERE id = cp.last_read_message_id
          )
        )
      GROUP BY cp.chat_id
    `);

    const perChat = result.rows.map((r) => ({
      chatId: ChatId.raw(r.chat_id),
      count: Number(r.cnt),
    }));
    const totalUnreadCount = perChat.reduce((sum, c) => sum + c.count, 0);
    return { totalUnreadCount, perChat };
  }

  private async listForChatIds(
    chatIdList: string[],
    requesterUserId: UserId,
    from: number,
    size: number,
  ): Promise<ChatListPage> {
    const db = this.txHost.get(NO_TRANSACTION);

    const total = chatIdList.length;
    const slice = chatIdList.slice(from, from + size);
    if (slice.length === 0) return { chats: [], total };

    const chatRows = await db
      .select()
      .from(chats)
      .where(
        sql`${chats.id} IN (${sql.join(
          slice.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
      )
      .orderBy(desc(chats.lastMessageAt));

    const participantRows = await db
      .select()
      .from(chatParticipants)
      .where(
        sql`${chatParticipants.chatId} IN (${sql.join(
          slice.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
      );

    // Compute unread per chat for requesterUserId.
    const unreadRows = await db.execute<{ chat_id: string; cnt: number }>(sql`
      SELECT cp.chat_id AS chat_id, COUNT(m.id)::int AS cnt
      FROM chat_participants cp
      JOIN chat_messages m ON m.chat_id = cp.chat_id
      WHERE cp.chat_id IN (${sql.join(
        slice.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
        AND (
          (cp.kind = 'user' AND cp.subject_id = ${requesterUserId as string})
          OR cp.assigned_user_id = ${requesterUserId as string}
        )
        AND m.kind <> 'system'
        AND m.deleted_at IS NULL
        AND (m.sender_participant_id IS NULL OR m.sender_participant_id <> cp.id)
        AND (
          cp.last_read_message_id IS NULL
          OR m.created_at > (
            SELECT created_at FROM chat_messages WHERE id = cp.last_read_message_id
          )
        )
      GROUP BY cp.chat_id
    `);
    const unreadByChat = new Map<string, number>();
    for (const row of unreadRows.rows) unreadByChat.set(row.chat_id, Number(row.cnt));

    const items: ChatListItem[] = chatRows.map((c) => {
      const myParticipants = participantRows.filter((p) => p.chatId === c.id);
      return {
        chatId: ChatId.raw(c.id),
        status: c.status as 'open' | 'closed' | 'blocked',
        participants: myParticipants.map((p) => ({
          id: ChatParticipantId.raw(p.id),
          kind: p.kind as ParticipantKind,
          subjectId: p.subjectId,
          assignedUserId: p.assignedUserId === null ? null : (p.assignedUserId as UserId),
        })),
        contextItemId: c.contextItemId,
        lastMessage:
          c.lastMessageId !== null && c.lastMessageAt !== null && c.lastMessagePreview !== null
            ? {
                messageId: ChatMessageId.raw(c.lastMessageId),
                preview: c.lastMessagePreview,
                senderParticipantId:
                  c.lastMessageSenderParticipantId === null
                    ? null
                    : ChatParticipantId.raw(c.lastMessageSenderParticipantId),
                createdAt: c.lastMessageAt,
              }
            : null,
        myUnreadCount: unreadByChat.get(c.id) ?? 0,
        updatedAt: c.updatedAt,
      };
    });

    return { chats: items, total };
  }
}


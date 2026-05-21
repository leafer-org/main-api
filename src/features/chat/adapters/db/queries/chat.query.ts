import { Inject, Injectable, Logger } from '@nestjs/common';
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
  type MessageAttachmentDto,
  type OrganizationRefDto,
  type UnreadSummary,
  UnreadSummaryQueryPort,
  type UserRefDto,
} from '../../../application/ports.js';
import type { MessageAttachment } from '../../../domain/vo/message-attachment.js';
import type { MessageKind, SystemEvent } from '../../../domain/vo/message-kind.js';
import { chatMessages, chatParticipants, chats } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import {
  ItemDirectoryPort,
  type ItemDirectoryView,
} from '@/kernel/application/ports/item-directory.js';
import {
  type GetDownloadUrlOptions,
  MediaService,
} from '@/kernel/application/ports/media.js';
import {
  OrganizationDirectoryPort,
  type OrganizationDirectoryView,
} from '@/kernel/application/ports/organization-directory.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';
import {
  UserDirectoryPort,
  type UserDirectoryView,
} from '@/kernel/application/ports/user-directory.js';
import {
  ChatId,
  ChatMessageId,
  ChatParticipantId,
  type ItemId,
  type MediaId,
  type OrganizationId,
  type UserId,
} from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const AVATAR_OPTIONS: GetDownloadUrlOptions = {
  visibility: 'PUBLIC',
  imageProxy: { width: 192, height: 192, quality: 80, format: 'webp' },
};

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

type RawParticipant = {
  id: string;
  chatId: string;
  kind: string;
  subjectId: string | null;
  assignedUserId: string | null;
};

function extractItemTitle(view: ItemDirectoryView): string | null {
  const baseInfo = view.widgets.find((w) => w.type === 'base-info');
  if (!baseInfo || baseInfo.type !== 'base-info') return null;
  const title = baseInfo.title;
  return typeof title === 'string' && title.length > 0 ? title : null;
}

@Injectable()
export class DrizzleChatQuery
  extends ChatListQueryPort
  implements ChatDetailQueryPort, ChatMessagesQueryPort, UnreadSummaryQueryPort
{
  private readonly logger = new Logger(DrizzleChatQuery.name);

  public constructor(
    private readonly txHost: TransactionHostPg,
    @Inject(ChatOrganizationMembershipReadModel)
    private readonly orgMembership: ChatOrganizationMembershipReadModel,
    @Inject(PermissionCheckService)
    private readonly permissionCheck: PermissionCheckService,
    @Inject(UserDirectoryPort)
    private readonly userDirectory: UserDirectoryPort,
    @Inject(OrganizationDirectoryPort)
    private readonly orgDirectory: OrganizationDirectoryPort,
    @Inject(ItemDirectoryPort)
    private readonly itemDirectory: ItemDirectoryPort,
    @Inject(MediaService)
    private readonly mediaService: MediaService,
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
      attachments: (row.attachments as MessageAttachmentDto[] | null) ?? [],
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

    // Per-user unread: cursor берётся из chat_participant_user_reads (cpur)
    // для пары (participant_id, requesterUserId). NULL ⇒ все сообщения
    // непрочитаны. Access — user-slot subject, claimed operator-slot,
    // или member организации для org-slot.
    const result = await db.execute<{ chat_id: string; cnt: number }>(sql`
      SELECT cp.chat_id AS chat_id, COUNT(m.id)::int AS cnt
      FROM chat_participants cp
      LEFT JOIN chat_participant_user_reads cpur
        ON cpur.participant_id = cp.id AND cpur.user_id = ${userId as string}
      JOIN chat_messages m ON m.chat_id = cp.chat_id
      WHERE (
          (cp.kind = 'user' AND cp.subject_id = ${userId as string})
          OR cp.assigned_user_id = ${userId as string}
          OR (cp.kind = 'organization' AND cp.subject_id IN (
                SELECT organization_id FROM chat_organization_members
                WHERE user_id = ${userId as string}
              ))
        )
        AND m.kind <> 'system'
        AND m.deleted_at IS NULL
        AND (m.sender_participant_id IS NULL OR m.sender_participant_id <> cp.id)
        AND (
          cpur.last_read_message_id IS NULL
          OR m.created_at > cpur.last_read_at
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

    // Per-user unread (см. findUnread). Access — те же три ветки:
    // user-slot, claimed operator-slot, member org для org-slot.
    const unreadRows = await db.execute<{ chat_id: string; cnt: number }>(sql`
      SELECT cp.chat_id AS chat_id, COUNT(m.id)::int AS cnt
      FROM chat_participants cp
      LEFT JOIN chat_participant_user_reads cpur
        ON cpur.participant_id = cp.id AND cpur.user_id = ${requesterUserId as string}
      JOIN chat_messages m ON m.chat_id = cp.chat_id
      WHERE cp.chat_id IN (${sql.join(
        slice.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
        AND (
          (cp.kind = 'user' AND cp.subject_id = ${requesterUserId as string})
          OR cp.assigned_user_id = ${requesterUserId as string}
          OR (cp.kind = 'organization' AND cp.subject_id IN (
                SELECT organization_id FROM chat_organization_members
                WHERE user_id = ${requesterUserId as string}
              ))
        )
        AND m.kind <> 'system'
        AND m.deleted_at IS NULL
        AND (m.sender_participant_id IS NULL OR m.sender_participant_id <> cp.id)
        AND (
          cpur.last_read_message_id IS NULL
          OR m.created_at > cpur.last_read_at
        )
      GROUP BY cp.chat_id
    `);
    const unreadByChat = new Map<string, number>();
    for (const row of unreadRows.rows) unreadByChat.set(row.chat_id, Number(row.cnt));

    // --- Last messages: для preview-обогащения по attachments нужны сами строки сообщений
    const lastMessageIds = chatRows
      .map((c) => c.lastMessageId)
      .filter((id): id is string => id !== null);
    const lastMessageRows = lastMessageIds.length
      ? await db
          .select()
          .from(chatMessages)
          .where(
            sql`${chatMessages.id} IN (${sql.join(
              lastMessageIds.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})`,
          )
      : [];
    const lastMessageById = new Map<string, typeof lastMessageRows[number]>();
    for (const m of lastMessageRows) lastMessageById.set(m.id, m);

    // --- Enrichment: собрать userIds + orgIds + itemIds, безопасные batch-lookup'ы ---
    const participantsByChat = new Map<string, RawParticipant[]>();
    for (const p of participantRows) {
      const list = participantsByChat.get(p.chatId) ?? [];
      list.push(p);
      participantsByChat.set(p.chatId, list);
    }

    const userIdSet = new Set<string>();
    const orgIdSet = new Set<string>();
    const itemIdSet = new Set<string>();

    for (const p of participantRows) {
      if (p.kind === 'user' && p.subjectId) userIdSet.add(p.subjectId);
      if (p.kind === 'organization' && p.subjectId) orgIdSet.add(p.subjectId);
      if (p.assignedUserId) userIdSet.add(p.assignedUserId);
    }

    // Sender user resolution (lastMessage.senderParticipantId → user via slot)
    for (const c of chatRows) {
      const senderParticipantId = c.lastMessageSenderParticipantId;
      if (!senderParticipantId) continue;
      const slot = participantRows.find(
        (p) => p.id === senderParticipantId && p.chatId === c.id,
      );
      if (!slot) continue;
      const senderUserId = this.resolveSenderUserId(slot);
      if (senderUserId) userIdSet.add(senderUserId);
    }

    // Item-ref attachments в последних сообщениях — для preview-обогащения.
    for (const m of lastMessageRows) {
      const attachments = (m.attachments as MessageAttachment[]) ?? [];
      for (const a of attachments) {
        if (a.kind === 'item-ref') itemIdSet.add(a.itemId as string);
      }
    }

    const [userMap, orgMap, itemMap] = await Promise.all([
      this.safeBatchUsers([...userIdSet] as UserId[]),
      this.safeBatchOrganizations([...orgIdSet] as OrganizationId[]),
      this.safeBatchItems([...itemIdSet] as ItemId[]),
    ]);

    // Собрать аватары для batch-lookup URLs одним вызовом.
    const avatarIds: MediaId[] = [];
    for (const u of userMap.values()) {
      if (u.avatarMediaId) avatarIds.push(u.avatarMediaId);
    }
    for (const o of orgMap.values()) {
      if (o.avatarId) avatarIds.push(o.avatarId);
    }
    const avatarUrlMap = await this.safeBatchAvatarUrls(avatarIds);

    const items: ChatListItem[] = chatRows.map((c) => {
      const myParticipants = participantsByChat.get(c.id) ?? [];

      const lastMessageRow = c.lastMessageId ? lastMessageById.get(c.lastMessageId) : undefined;
      const lastMessage =
        c.lastMessageId !== null && c.lastMessageAt !== null && c.lastMessagePreview !== null
          ? {
              messageId: ChatMessageId.raw(c.lastMessageId),
              preview: this.buildLastMessagePreview(
                c.lastMessagePreview,
                lastMessageRow?.attachments as MessageAttachment[] | undefined,
                itemMap,
              ),
              senderParticipantId:
                c.lastMessageSenderParticipantId === null
                  ? null
                  : ChatParticipantId.raw(c.lastMessageSenderParticipantId),
              senderUser: this.resolveSenderUser(
                c.lastMessageSenderParticipantId,
                myParticipants,
                userMap,
                avatarUrlMap,
              ),
              createdAt: c.lastMessageAt,
            }
          : null;

      return {
        chatId: ChatId.raw(c.id),
        status: c.status as 'open' | 'blocked',
        participants: myParticipants.map((p) => ({
          id: ChatParticipantId.raw(p.id),
          subject: this.toSubject(p, userMap, orgMap, avatarUrlMap),
          // assignedUser имеет смысл только для operator-slot'ов (organization/support).
          // Для user-slot'а assignedUserId == subjectId — это сам клиент, дублировать не нужно.
          assignedUser:
            p.kind !== 'user' && p.assignedUserId !== null
              ? this.toUserRef(p.assignedUserId as UserId, userMap, avatarUrlMap)
              : null,
        })),
        lastMessage,
        myUnreadCount: unreadByChat.get(c.id) ?? 0,
        updatedAt: c.updatedAt,
      };
    });

    return { chats: items, total };
  }

  /**
   * Превью последнего сообщения с учётом attachments.
   * Приоритет: непустой текст → item-ref title → stored preview (`[media]`).
   * itemMap может не содержать item (товар удалён / приватный) — fallback на «Товар».
   */
  private buildLastMessagePreview(
    storedPreview: string,
    attachments: readonly MessageAttachment[] | undefined,
    itemMap: Map<string, ItemDirectoryView>,
  ): string {
    if (storedPreview.length > 0 && storedPreview !== '[media]') return storedPreview;
    if (attachments && attachments.length > 0) {
      const itemRef = attachments.find((a) => a.kind === 'item-ref');
      if (itemRef) {
        const view = itemMap.get(itemRef.itemId as string);
        const title = view ? extractItemTitle(view) : null;
        return title ? `📌 ${title}` : '📌 Товар';
      }
    }
    return storedPreview;
  }

  /** Конкретный userId, написавший сообщение, по slot'у: для user-slot'а subjectId, для org/support — assignedUserId. */
  private resolveSenderUserId(slot: RawParticipant): string | null {
    if (slot.kind === 'user') return slot.subjectId;
    return slot.assignedUserId;
  }

  private resolveSenderUser(
    senderParticipantId: string | null,
    participants: RawParticipant[],
    userMap: Map<string, UserDirectoryView>,
    avatarUrlMap: Map<string, string>,
  ): UserRefDto | null {
    if (!senderParticipantId) return null;
    const slot = participants.find((p) => p.id === senderParticipantId);
    if (!slot) return null;
    const userId = this.resolveSenderUserId(slot);
    if (!userId) return null;
    return this.toUserRef(userId as UserId, userMap, avatarUrlMap);
  }

  private toSubject(
    p: RawParticipant,
    userMap: Map<string, UserDirectoryView>,
    orgMap: Map<string, OrganizationDirectoryView>,
    avatarUrlMap: Map<string, string>,
  ): UserRefDto | OrganizationRefDto | null {
    if (!p.subjectId) return null;
    if (p.kind === 'user') return this.toUserRef(p.subjectId as UserId, userMap, avatarUrlMap);
    if (p.kind === 'organization')
      return this.toOrgRef(p.subjectId as OrganizationId, orgMap, avatarUrlMap);
    return null;
  }

  private toUserRef(
    id: UserId,
    userMap: Map<string, UserDirectoryView>,
    avatarUrlMap: Map<string, string>,
  ): UserRefDto {
    const u = userMap.get(id as string);
    if (!u) return { kind: 'user', id, fullName: null, avatarUrl: null };
    return {
      kind: 'user',
      id,
      fullName: u.fullName,
      avatarUrl: u.avatarMediaId ? (avatarUrlMap.get(u.avatarMediaId as string) ?? null) : null,
    };
  }

  private toOrgRef(
    id: OrganizationId,
    orgMap: Map<string, OrganizationDirectoryView>,
    avatarUrlMap: Map<string, string>,
  ): OrganizationRefDto {
    const o = orgMap.get(id as string);
    if (!o) return { kind: 'organization', id, name: null, logoUrl: null };
    return {
      kind: 'organization',
      id,
      name: o.name,
      logoUrl: o.avatarId ? (avatarUrlMap.get(o.avatarId as string) ?? null) : null,
    };
  }

  /**
   * Безопасный batch-lookup user'ов. При исключении (БД directory недоступна,
   * RPC timeout и т.п.) возвращает пустую map — на этапе маппинга
   * субъекты получают placeholder { kind, id, fullName: null, avatarUrl: null }.
   */
  private async safeBatchUsers(ids: UserId[]): Promise<Map<string, UserDirectoryView>> {
    if (ids.length === 0) return new Map();
    try {
      const list = await this.userDirectory.findByIds(ids);
      const map = new Map<string, UserDirectoryView>();
      for (const u of list) map.set(u.userId as string, u);
      return map;
    } catch (err) {
      this.logger.error('user enrichment failed', err as Error);
      return new Map();
    }
  }

  private async safeBatchOrganizations(
    ids: OrganizationId[],
  ): Promise<Map<string, OrganizationDirectoryView>> {
    if (ids.length === 0) return new Map();
    try {
      const list = await this.orgDirectory.findByIds(ids);
      const map = new Map<string, OrganizationDirectoryView>();
      for (const o of list) map.set(o.organizationId as string, o);
      return map;
    } catch (err) {
      this.logger.error('organization enrichment failed', err as Error);
      return new Map();
    }
  }

  private async safeBatchAvatarUrls(ids: MediaId[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    try {
      const urls = await this.mediaService.getDownloadUrls(
        ids.map((fileId) => ({ fileId, options: AVATAR_OPTIONS })),
      );
      const map = new Map<string, string>();
      for (const [i, id] of ids.entries()) {
        const url = urls[i];
        if (url) map.set(id as string, url);
      }
      return map;
    } catch (err) {
      this.logger.error('avatar url batch failed', err as Error);
      return new Map();
    }
  }

  private async safeBatchItems(ids: ItemId[]): Promise<Map<string, ItemDirectoryView>> {
    if (ids.length === 0) return new Map();
    try {
      const list = await this.itemDirectory.findByIds(ids);
      const map = new Map<string, ItemDirectoryView>();
      for (const i of list) map.set(i.itemId as string, i);
      return map;
    } catch (err) {
      this.logger.error('item enrichment failed', err as Error);
      return new Map();
    }
  }
}

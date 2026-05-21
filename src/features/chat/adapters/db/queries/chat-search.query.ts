import { Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';

import {
  type ChatSearchHit,
  ChatSearchQueryPort,
  type ChatSearchResultGlobal,
  type ChatSearchResultInChat,
  type OperatorSearchFilters,
} from '../../../application/ports.js';
import type { ParticipantKind } from '../../../domain/vo/participant-kind.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';
import {
  ChatId,
  ChatMessageId,
  ChatParticipantId,
  type UserId,
} from '@/kernel/domain/ids.js';

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const Q_MAX_LENGTH = 200;

type CursorPayload = { offset: number };

function encodeCursor(p: CursorPayload): string {
  return Buffer.from(JSON.stringify(p)).toString('base64url');
}
function decodeCursor(raw: string): CursorPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as CursorPayload;
    if (typeof parsed.offset !== 'number' || parsed.offset < 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Полнотекстовый поиск по сообщениям через Postgres tsvector.
 *
 * Конфиг — `russian` (проект rus-first). Английские слова частично
 * обрабатываются (split по пробелам), стемминг русский. Open question
 * из спеки — для полноценной поддержки EN при необходимости перейдём на
 * композитный `to_tsvector('russian', x) || to_tsvector('english', x)`.
 *
 * Видимость:
 *  - searchForUser: чат имеет participant kind='user' с subjectId=userId,
 *    либо assigned_user_id=userId.
 *  - searchForOperator: чат имеет operator-слот в пуле user'а или claim'нут им.
 *
 * Удалённые/системные сообщения исключены WHERE'ом (search_tsv заполняется
 * inline через to_tsvector — индекс должен быть expression-based).
 */
@Injectable()
export class DrizzleChatSearchQuery extends ChatSearchQueryPort {
  public constructor(private readonly txHost: TransactionHostPg) {
    super();
  }

  public async searchForUser(
    userId: UserId,
    params: { q: string; chatId?: ChatId; cursor?: string; limit?: number },
  ): Promise<ChatSearchResultGlobal | ChatSearchResultInChat> {
    const visibilityCond = sql`(
      cp.kind = 'user' AND cp.subject_id = ${userId as string}
      OR cp.assigned_user_id = ${userId as string}
    )`;
    return this.runSearch(userId, visibilityCond, {
      ...params,
      includeChatPreview: params.chatId === undefined,
    });
  }

  public async searchForOperator(
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
  ): Promise<ChatSearchResultGlobal | ChatSearchResultInChat> {
    const orgFilter = params.filters?.orgId;
    const slotKind = params.filters?.slotKind;

    // Operator visibility: assigned to user OR slot in his pool.
    const conditions: SQL[] = [sql`cp.assigned_user_id = ${userId as string}`];

    const orgIdsToCheck = orgFilter
      ? memberOrgIds.includes(orgFilter)
        ? [orgFilter]
        : []
      : memberOrgIds;

    if ((slotKind === undefined || slotKind === 'organization') && orgIdsToCheck.length > 0) {
      conditions.push(
        sql`(cp.kind = 'organization' AND cp.subject_id IN (${sql.join(
          orgIdsToCheck.map((id) => sql`${id}`),
          sql`, `,
        )}))`,
      );
    }
    if ((slotKind === undefined || slotKind === 'support') && isSupport) {
      conditions.push(sql`cp.kind = 'support'`);
    }

    const visibilityCond = sql`(${sql.join(conditions, sql` OR `)})`;

    const extraConds: SQL[] = [];
    if (params.filters?.status) {
      extraConds.push(sql`c.status = ${params.filters.status}`);
    }
    if (params.filters?.from) {
      extraConds.push(sql`m.created_at >= ${params.filters.from.toISOString()}`);
    }
    if (params.filters?.to) {
      extraConds.push(sql`m.created_at <= ${params.filters.to.toISOString()}`);
    }

    return this.runSearch(userId, visibilityCond, {
      ...params,
      extraConds,
      includeChatPreview: params.chatId === undefined,
    });
  }

  private async runSearch(
    userId: UserId,
    visibilityCond: SQL,
    params: {
      q: string;
      chatId?: ChatId;
      cursor?: string;
      limit?: number;
      extraConds?: SQL[];
      includeChatPreview: boolean;
    },
  ): Promise<ChatSearchResultGlobal | ChatSearchResultInChat> {
    const db = this.txHost.get(NO_TRANSACTION);
    const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = params.cursor ? (decodeCursor(params.cursor)?.offset ?? 0) : 0;
    const q = params.q.slice(0, Q_MAX_LENGTH);

    const chatIdFilter = params.chatId
      ? sql`AND m.chat_id = ${params.chatId as string}::uuid`
      : sql``;

    const extraFilter = params.extraConds && params.extraConds.length > 0
      ? sql`AND ${sql.join(params.extraConds, sql` AND `)}`
      : sql``;

    const result = await db.execute<{
      message_id: string;
      chat_id: string;
      snippet: string;
      highlighted: string;
      sender_participant_id: string | null;
      sender_user_id: string | null;
      sender_kind: ParticipantKind | null;
      created_at: Date;
    }>(sql`
      SELECT
        m.id AS message_id,
        m.chat_id AS chat_id,
        ts_headline('russian', coalesce(m.text, ''),
          websearch_to_tsquery('russian', ${q}),
          'MaxFragments=1, FragmentDelimiter=" … ", StartSel="", StopSel=""'
        ) AS snippet,
        ts_headline('russian', coalesce(m.text, ''),
          websearch_to_tsquery('russian', ${q}),
          'MaxFragments=1, FragmentDelimiter=" … ", StartSel=<mark>, StopSel=</mark>'
        ) AS highlighted,
        m.sender_participant_id AS sender_participant_id,
        m.actor_user_id AS sender_user_id,
        sp.kind AS sender_kind,
        m.created_at AS created_at
      FROM chat_messages m
      JOIN chats c ON c.id = m.chat_id
      LEFT JOIN chat_participants sp ON sp.id = m.sender_participant_id
      WHERE m.deleted_at IS NULL
        AND m.kind <> 'system'
        AND to_tsvector('russian', coalesce(m.text, ''))
            @@ websearch_to_tsquery('russian', ${q})
        AND EXISTS (
          SELECT 1 FROM chat_participants cp
          WHERE cp.chat_id = m.chat_id
            AND ${visibilityCond}
        )
        ${chatIdFilter}
        ${extraFilter}
      ORDER BY ts_rank_cd(
                 to_tsvector('russian', coalesce(m.text, '')),
                 websearch_to_tsquery('russian', ${q})
               ) DESC,
               m.created_at DESC
      LIMIT ${limit + 1}
      OFFSET ${offset}
    `);

    const hasMore = result.rows.length > limit;
    const slice = hasMore ? result.rows.slice(0, limit) : result.rows;

    const hits: ChatSearchHit[] = slice.map((r) => ({
      messageId: ChatMessageId.raw(r.message_id),
      chatId: ChatId.raw(r.chat_id),
      snippet: r.snippet,
      highlightedText: r.highlighted,
      senderParticipantId:
        r.sender_participant_id === null
          ? null
          : ChatParticipantId.raw(r.sender_participant_id),
      senderUserId: r.sender_user_id === null ? null : (r.sender_user_id as UserId),
      senderKind: r.sender_kind,
      createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at as unknown as string),
    }));

    if (!params.includeChatPreview) {
      const inChat: ChatSearchResultInChat = {
        results: hits,
        nextCursor: hasMore ? encodeCursor({ offset: offset + limit }) : null,
      };
      return inChat;
    }

    const previewByChatId = await this.fetchChatPreviews(
      userId,
      hits.map((h) => h.chatId as string),
    );

    const global: ChatSearchResultGlobal = {
      results: hits.map((h) => ({
        ...h,
        chatPreview: previewByChatId.get(h.chatId as string) ?? null,
      })),
      nextCursor: hasMore ? encodeCursor({ offset: offset + limit }) : null,
    };
    return global;
  }

  private async fetchChatPreviews(
    userId: UserId,
    chatIds: string[],
  ): Promise<
    Map<
      string,
      { partyOther: { kind: 'user' | 'organization' | 'support'; subjectId: string | null } }
    >
  > {
    if (chatIds.length === 0) return new Map();

    const db = this.txHost.get(NO_TRANSACTION);
    const rows = await db.execute<{
      chat_id: string;
      participant_kind: ParticipantKind;
      participant_subject_id: string | null;
    }>(sql`
      SELECT
        c.id AS chat_id,
        cp.kind AS participant_kind,
        cp.subject_id AS participant_subject_id
      FROM chats c
      JOIN chat_participants cp ON cp.chat_id = c.id
      WHERE c.id IN (${sql.join(
        chatIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
        AND NOT (cp.kind = 'user' AND cp.subject_id = ${userId as string})
    `);

    const map = new Map<
      string,
      { partyOther: { kind: 'user' | 'organization' | 'support'; subjectId: string | null } }
    >();
    for (const r of rows.rows) {
      // Берём первого «другого» — для пары (user↔org/support) это один participant.
      if (map.has(r.chat_id)) continue;
      map.set(r.chat_id, {
        partyOther: {
          kind: r.participant_kind,
          subjectId: r.participant_subject_id,
        },
      });
    }
    return map;
  }
}

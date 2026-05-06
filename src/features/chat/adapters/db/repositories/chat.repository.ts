import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { ChatRepository } from '../../../application/ports.js';
import type {
  ChatParticipant,
  ChatState,
  ChatStatus,
  LastMessageSnapshot,
} from '../../../domain/aggregates/chat/state.js';
import type { ParticipantKind } from '../../../domain/vo/participant-kind.js';
import { chatParticipants, chats } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import {
  ChatId,
  ChatMessageId,
  ChatParticipantId,
  ItemId,
  UserId,
} from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleChatRepository extends ChatRepository {
  public constructor(private readonly txHost: TransactionHostPg) {
    super();
  }

  public async findById(tx: Transaction, chatId: ChatId): Promise<ChatState | null> {
    const db = this.txHost.get(tx);
    const rows = await db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return this.hydrate(tx, row);
  }

  public async findByPairKey(tx: Transaction, pairKey: string): Promise<ChatState | null> {
    const db = this.txHost.get(tx);
    const rows = await db.select().from(chats).where(eq(chats.pairKey, pairKey)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return this.hydrate(tx, row);
  }

  public async save(tx: Transaction, state: ChatState, pairKey: string): Promise<void> {
    const db = this.txHost.get(tx);

    const lastMessageId = state.lastMessage?.messageId ?? null;
    const lastMessageAt = state.lastMessage?.createdAt ?? null;
    const lastMessagePreview = state.lastMessage?.preview ?? null;
    const lastMessageSender = state.lastMessage?.senderParticipantId ?? null;

    await db
      .insert(chats)
      .values({
        id: state.chatId,
        pairKey,
        status: state.status,
        blockedByParticipantId: state.blockedByParticipantId as string | null,
        blockedAt: state.blockedAt,
        contextItemId: state.contextItemId as string | null,
        lastMessageId: lastMessageId as string | null,
        lastMessageAt,
        lastMessagePreview,
        lastMessageSenderParticipantId: lastMessageSender as string | null,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      })
      .onConflictDoUpdate({
        target: chats.id,
        set: {
          status: state.status,
          blockedByParticipantId: state.blockedByParticipantId as string | null,
          blockedAt: state.blockedAt,
          contextItemId: state.contextItemId as string | null,
          lastMessageId: lastMessageId as string | null,
          lastMessageAt,
          lastMessagePreview,
          lastMessageSenderParticipantId: lastMessageSender as string | null,
          updatedAt: state.updatedAt,
        },
      });

    for (const p of state.participants) {
      await db
        .insert(chatParticipants)
        .values({
          id: p.id,
          chatId: state.chatId,
          kind: p.kind,
          subjectId: p.subjectId,
          assignedUserId: p.assignedUserId as string | null,
          claimedAt: p.claimedAt,
          lastReadMessageId: p.lastReadMessageId as string | null,
          createdAt: p.createdAt,
        })
        .onConflictDoUpdate({
          target: chatParticipants.id,
          set: {
            assignedUserId: p.assignedUserId as string | null,
            claimedAt: p.claimedAt,
            lastReadMessageId: p.lastReadMessageId as string | null,
          },
        });
    }
  }

  private async hydrate(
    tx: Transaction,
    row: typeof chats.$inferSelect,
  ): Promise<ChatState> {
    const db = this.txHost.get(tx);
    const participantRows = await db
      .select()
      .from(chatParticipants)
      .where(eq(chatParticipants.chatId, row.id));

    const participants: ChatParticipant[] = participantRows.map((p) => ({
      id: ChatParticipantId.raw(p.id),
      kind: p.kind as ParticipantKind,
      subjectId: p.subjectId,
      assignedUserId: p.assignedUserId === null ? null : UserId.raw(p.assignedUserId),
      claimedAt: p.claimedAt,
      lastReadMessageId:
        p.lastReadMessageId === null ? null : ChatMessageId.raw(p.lastReadMessageId),
      createdAt: p.createdAt,
    }));

    const lastMessage: LastMessageSnapshot | null =
      row.lastMessageId !== null && row.lastMessageAt !== null && row.lastMessagePreview !== null
        ? {
            messageId: ChatMessageId.raw(row.lastMessageId),
            preview: row.lastMessagePreview,
            senderParticipantId:
              row.lastMessageSenderParticipantId === null
                ? null
                : ChatParticipantId.raw(row.lastMessageSenderParticipantId),
            createdAt: row.lastMessageAt,
          }
        : null;

    return {
      chatId: ChatId.raw(row.id),
      status: row.status as ChatStatus,
      blockedByParticipantId:
        row.blockedByParticipantId === null
          ? null
          : ChatParticipantId.raw(row.blockedByParticipantId),
      blockedAt: row.blockedAt,
      contextItemId: row.contextItemId === null ? null : ItemId.raw(row.contextItemId),
      participants,
      lastMessage,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { MessageRepository } from '../../../application/ports.js';
import type { MessageState } from '../../../domain/aggregates/message/state.js';
import type { MessageKind, SystemEvent } from '../../../domain/vo/message-kind.js';
import { chatMessages } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import {
  ChatId,
  ChatMessageId,
  ChatParticipantId,
  type MediaId,
  UserId,
} from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleMessageRepository extends MessageRepository {
  public constructor(private readonly txHost: TransactionHostPg) {
    super();
  }

  public async findById(tx: Transaction, messageId: ChatMessageId): Promise<MessageState | null> {
    const db = this.txHost.get(tx);
    const rows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, messageId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return this.toDomain(row);
  }

  public async save(tx: Transaction, state: MessageState): Promise<void> {
    const db = this.txHost.get(tx);

    await db
      .insert(chatMessages)
      .values({
        id: state.messageId,
        chatId: state.chatId,
        senderParticipantId: state.senderParticipantId as string | null,
        actorUserId: state.actorUserId as string | null,
        kind: state.kind,
        text: state.text,
        mediaIds: state.mediaIds as MediaId[],
        systemEvent: state.systemEvent,
        createdAt: state.createdAt,
        editedAt: state.editedAt,
        deletedAt: state.deletedAt,
      })
      .onConflictDoUpdate({
        target: chatMessages.id,
        set: {
          kind: state.kind,
          text: state.text,
          mediaIds: state.mediaIds as MediaId[],
          editedAt: state.editedAt,
          deletedAt: state.deletedAt,
        },
      });
  }

  private toDomain(row: typeof chatMessages.$inferSelect): MessageState {
    return {
      messageId: ChatMessageId.raw(row.id),
      chatId: ChatId.raw(row.chatId),
      senderParticipantId:
        row.senderParticipantId === null
          ? null
          : ChatParticipantId.raw(row.senderParticipantId),
      actorUserId: row.actorUserId === null ? null : UserId.raw(row.actorUserId),
      kind: row.kind as MessageKind,
      text: row.text,
      mediaIds: (row.mediaIds as string[]).map((m) => m as MediaId),
      systemEvent: row.systemEvent as SystemEvent | null,
      createdAt: row.createdAt,
      editedAt: row.editedAt,
      deletedAt: row.deletedAt,
    };
  }
}

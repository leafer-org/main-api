import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { CHAT_CONSUMER_ID } from './consumer-ids.js';
import { chatParticipantUserReads } from '../db/schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { chatStreamingContract } from '@/infra/kafka-contracts/chat.contract.js';
import {
  ContractHandler,
  type ContractKafkaMessage,
  KafkaConsumerHandlers,
} from '@/infra/lib/nest-kafka/index.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';

/**
 * Заполняет per-user read cursor по событию `chat.read`.
 *
 * Идемпотентность: ON CONFLICT (participant_id, user_id) DO UPDATE
 *  WHERE existing.last_read_at < incoming.last_read_at — защищает от
 *  out-of-order доставки и повторов из retry.
 *
 * Источник истины для unread'а — эта таблица; курсор на самом slot'е
 * удалён (см. refactor-4-chat-per-user-read-cursors.md).
 */
@KafkaConsumerHandlers(CHAT_CONSUMER_ID)
@Injectable()
export class ChatReadProjectionHandler {
  public constructor(private readonly txHost: TransactionHostPg) {}

  @ContractHandler(chatStreamingContract)
  public async handle(
    message: ContractKafkaMessage<typeof chatStreamingContract>,
  ): Promise<void> {
    const payload = message.value;
    if (payload.type !== 'chat.read') return;
    if (!payload.participantId || !payload.readerUserId || !payload.upToMessageId) return;

    const db = this.txHost.get(NO_TRANSACTION);
    const lastReadAt = new Date(payload.occurredAt);

    await db
      .insert(chatParticipantUserReads)
      .values({
        participantId: payload.participantId,
        userId: payload.readerUserId,
        lastReadMessageId: payload.upToMessageId,
        lastReadAt,
      })
      .onConflictDoUpdate({
        target: [chatParticipantUserReads.participantId, chatParticipantUserReads.userId],
        set: {
          lastReadMessageId: payload.upToMessageId,
          lastReadAt,
        },
        setWhere: sql`${chatParticipantUserReads.lastReadAt} < ${lastReadAt}`,
      });
  }
}

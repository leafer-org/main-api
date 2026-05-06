import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { ChatEventPublisher } from '../../application/ports.js';
import type { ChatEvent } from '../../domain/aggregates/chat/events.js';
import type { MessageEvent } from '../../domain/aggregates/message/events.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { chatStreamingContract } from '@/infra/kafka-contracts/chat.contract.js';
import { OutboxService } from '@/infra/lib/nest-outbox/outbox.service.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';

/**
 * Транзакционный publisher: складывает chat-событие в outbox в той же
 * транзакции, что и save аггрегата. Outbox-диспетчер дальше отправляет в
 * Kafka topic `chat.streaming`. Centrifugo-bridge консюмит топик и
 * раскладывает по каналам `chat:{chatId}`.
 *
 * `key: chatId` гарантирует упорядоченность событий одного чата в Kafka.
 */
@Injectable()
export class OutboxChatEventPublisher extends ChatEventPublisher {
  public constructor(
    private readonly txHost: TransactionHostPg,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {
    super();
  }

  public async publish(tx: Transaction, event: ChatEvent | MessageEvent): Promise<void> {
    const db = this.txHost.get(tx);
    await this.outbox.enqueue(db, chatStreamingContract, this.toMessage(event), {
      key: event.chatId as string,
    });
  }

  private toMessage(event: ChatEvent | MessageEvent) {
    const id = randomUUID();
    const chatId = event.chatId as string;

    switch (event.type) {
      case 'chat.opened':
        return {
          id,
          type: event.type,
          chatId,
          occurredAt: event.openedAt.toISOString(),
          contextItemId: event.contextItemId as string | null,
          participants: event.participants.map((p) => ({
            id: p.id as string,
            kind: p.kind,
            subjectId: p.subjectId,
            assignedUserId: p.assignedUserId as string | null,
          })),
          initiatorParticipantId: event.initiatorParticipantId as string,
        };
      case 'chat.reopened':
        return {
          id,
          type: event.type,
          chatId,
          occurredAt: event.reopenedAt.toISOString(),
          reopenedByParticipantId: event.reopenedByParticipantId as string,
        };
      case 'chat.message.sent':
        return {
          id,
          type: event.type,
          chatId,
          occurredAt: event.createdAt.toISOString(),
          messageId: event.messageId as string,
          senderParticipantId: event.senderParticipantId as string | null,
          messageKind: event.kind,
          text: event.text,
          mediaIds: event.mediaIds.map((m) => m as string),
          systemEvent: event.systemEvent,
        };
      case 'chat.message.edited':
        return {
          id,
          type: event.type,
          chatId,
          occurredAt: event.editedAt.toISOString(),
          messageId: event.messageId as string,
          actorUserId: event.actorUserId as string,
          text: event.text,
          mediaIds: event.mediaIds.map((m) => m as string),
        };
      case 'chat.message.deleted':
        return {
          id,
          type: event.type,
          chatId,
          occurredAt: event.deletedAt.toISOString(),
          messageId: event.messageId as string,
          actorUserId: event.actorUserId as string,
        };
      case 'chat.slot.claimed':
        return {
          id,
          type: event.type,
          chatId,
          occurredAt: event.claimedAt.toISOString(),
          participantId: event.participantId as string,
          userId: event.userId as string,
        };
      case 'chat.slot.released':
        return {
          id,
          type: event.type,
          chatId,
          occurredAt: event.releasedAt.toISOString(),
          participantId: event.participantId as string,
          oldAssigneeUserId: event.oldAssigneeUserId as string,
        };
      case 'chat.slot.reassigned':
        return {
          id,
          type: event.type,
          chatId,
          occurredAt: event.reassignedAt.toISOString(),
          participantId: event.participantId as string,
          oldAssigneeUserId: event.oldAssigneeUserId as string,
          newAssigneeUserId: event.newAssigneeUserId as string,
        };
      case 'chat.blocked':
        return {
          id,
          type: event.type,
          chatId,
          occurredAt: event.blockedAt.toISOString(),
          byParticipantId: event.byParticipantId as string,
          reason: event.reason,
        };
      case 'chat.unblocked':
        return {
          id,
          type: event.type,
          chatId,
          occurredAt: event.unblockedAt.toISOString(),
          byParticipantId: event.byParticipantId as string,
        };
      case 'chat.closed':
        return {
          id,
          type: event.type,
          chatId,
          occurredAt: event.closedAt.toISOString(),
          byParticipantId: event.byParticipantId as string,
          reason: event.reason,
        };
      case 'chat.read':
        return {
          id,
          type: event.type,
          chatId,
          occurredAt: event.readAt.toISOString(),
          participantId: event.participantId as string,
          upToMessageId: event.upToMessageId as string,
        };
    }
  }
}

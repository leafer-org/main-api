import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, lt } from 'drizzle-orm';

import { ChatNotFoundError } from '../../domain/aggregates/chat/errors.js';
import { MessageEntity } from '../../domain/aggregates/message/entity.js';
import {
  type CannotModifySystemMessageError,
  type DeleteWindowExpiredError,
  type MessageAlreadyDeletedError,
  MessageNotFoundError,
  type NotMessageAuthorError,
} from '../../domain/aggregates/message/errors.js';
import { chatMessages } from '../../adapters/db/schema.js';
import { pairKeyOf } from '../pair-key.js';
import {
  ChatEventPublisher,
  ChatRepository,
  MessageRepository,
} from '../ports.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { type Either, isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import { type ChatId, ChatMessageId, type ChatParticipantId, type UserId } from '@/kernel/domain/ids.js';

export type DeleteMessageCommand = {
  chatId: ChatId;
  messageId: ChatMessageId;
  actorUserId: UserId;
};

type DeleteError =
  | ChatNotFoundError
  | MessageNotFoundError
  | NotMessageAuthorError
  | CannotModifySystemMessageError
  | MessageAlreadyDeletedError
  | DeleteWindowExpiredError;

@Injectable()
export class DeleteMessageInteractor {
  public constructor(
    @Inject(ChatRepository) private readonly chatRepo: ChatRepository,
    @Inject(MessageRepository) private readonly messageRepo: MessageRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(TransactionHostPg) private readonly txHostPg: TransactionHostPg,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ChatEventPublisher) private readonly publisher: ChatEventPublisher,
  ) {}

  public async execute(cmd: DeleteMessageCommand): Promise<Either<DeleteError, void>> {
    return this.txHost.startTransaction(async (tx) => {
      const chat = await this.chatRepo.findById(tx, cmd.chatId);
      if (!chat) return Left(new ChatNotFoundError());

      const msg = await this.messageRepo.findById(tx, cmd.messageId);
      if (!msg || (msg.chatId as string) !== (cmd.chatId as string)) {
        return Left(new MessageNotFoundError());
      }

      const result = MessageEntity.delete(msg, {
        type: 'DeleteMessage',
        actorUserId: cmd.actorUserId,
        now: this.clock.now(),
      });
      if (isLeft(result)) return result;

      const { state, events } = result.value;
      await this.messageRepo.save(tx, state);

      // Если удалено last message — пересчитываем preview на чате.
      if (
        chat.lastMessage !== null &&
        (chat.lastMessage.messageId as string) === (cmd.messageId as string)
      ) {
        const previous = await this.findPreviousNonDeleted(tx, cmd.chatId, msg.createdAt);
        const updatedChat = {
          ...chat,
          lastMessage: previous,
          updatedAt: state.deletedAt ?? chat.updatedAt,
        };
        await this.chatRepo.save(tx, updatedChat, pairKeyOf(updatedChat.participants));
      }

      for (const event of events) {
        await this.publisher.publish(tx, event);
      }
      return Right(undefined);
    });
  }

  private async findPreviousNonDeleted(
    tx: import('@/kernel/application/ports/tx-host.js').Transaction,
    chatId: ChatId,
    before: Date,
  ): Promise<{
    messageId: ChatMessageId;
    preview: string;
    senderParticipantId: ChatParticipantId | null;
    createdAt: Date;
  } | null> {
    const db = this.txHostPg.get(tx);
    const rows = await db
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.chatId, chatId as string),
          isNull(chatMessages.deletedAt),
          lt(chatMessages.createdAt, before),
        ),
      )
      .orderBy(chatMessages.createdAt)
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    const text = row.text;
    const preview =
      text !== null && text.trim().length > 0 ? text.slice(0, 200) : '[media]';
    return {
      messageId: ChatMessageId.raw(row.id),
      preview,
      senderParticipantId:
        row.senderParticipantId === null
          ? null
          : (row.senderParticipantId as ChatParticipantId),
      createdAt: row.createdAt,
    };
  }
}

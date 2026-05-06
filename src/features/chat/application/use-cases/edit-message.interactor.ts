import { Inject, Injectable } from '@nestjs/common';

import { ChatNotFoundError } from '../../domain/aggregates/chat/errors.js';
import { MessageEntity } from '../../domain/aggregates/message/entity.js';
import {
  type CannotModifySystemMessageError,
  type EditWindowExpiredError,
  type MessageDeletedError,
  MessageNotFoundError,
  type NotMessageAuthorError,
} from '../../domain/aggregates/message/errors.js';
import {
  type EmptyMessageError,
  type MessageTextTooLongError,
  type MessageTooManyMediaError,
} from '../../domain/aggregates/chat/errors.js';
import { pairKeyOf } from '../pair-key.js';
import {
  ChatEventPublisher,
  ChatRepository,
  MessageRepository,
} from '../ports.js';
import { type Either, isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { ChatId, ChatMessageId, MediaId, UserId } from '@/kernel/domain/ids.js';

export type EditMessageCommand = {
  chatId: ChatId;
  messageId: ChatMessageId;
  actorUserId: UserId;
  text: string | null;
  mediaIds: readonly MediaId[];
};

type EditError =
  | ChatNotFoundError
  | MessageNotFoundError
  | NotMessageAuthorError
  | CannotModifySystemMessageError
  | MessageDeletedError
  | EditWindowExpiredError
  | EmptyMessageError
  | MessageTextTooLongError
  | MessageTooManyMediaError;

@Injectable()
export class EditMessageInteractor {
  public constructor(
    @Inject(ChatRepository) private readonly chatRepo: ChatRepository,
    @Inject(MessageRepository) private readonly messageRepo: MessageRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ChatEventPublisher) private readonly publisher: ChatEventPublisher,
  ) {}

  public async execute(cmd: EditMessageCommand): Promise<Either<EditError, void>> {
    return this.txHost.startTransaction(async (tx) => {
      const chat = await this.chatRepo.findById(tx, cmd.chatId);
      if (!chat) return Left(new ChatNotFoundError());

      const msg = await this.messageRepo.findById(tx, cmd.messageId);
      if (!msg || (msg.chatId as string) !== (cmd.chatId as string)) {
        return Left(new MessageNotFoundError());
      }

      const result = MessageEntity.edit(msg, {
        type: 'EditMessage',
        actorUserId: cmd.actorUserId,
        text: cmd.text,
        mediaIds: cmd.mediaIds,
        now: this.clock.now(),
      });
      if (isLeft(result)) return result;

      const { state, events } = result.value;
      await this.messageRepo.save(tx, state);

      // Если редактируется last message — обновим preview на чате.
      if (
        chat.lastMessage !== null &&
        (chat.lastMessage.messageId as string) === (cmd.messageId as string)
      ) {
        const preview =
          state.text !== null && state.text.trim().length > 0
            ? state.text.slice(0, 200)
            : '[media]';
        const updatedChat = {
          ...chat,
          lastMessage: { ...chat.lastMessage, preview, createdAt: chat.lastMessage.createdAt },
          updatedAt: state.editedAt ?? chat.updatedAt,
        };
        await this.chatRepo.save(tx, updatedChat, pairKeyOf(updatedChat.participants));
      }

      for (const event of events) {
        await this.publisher.publish(tx, event);
      }
      return Right(undefined);
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';

import { ChatEntity } from '../../domain/aggregates/chat/entity.js';
import { pairKeyOf } from '../pair-key.js';
import {
  ChatBlockedError,
  ChatNotFoundError,
  type ClaimRequiredError,
  type EmptyMessageError,
  type MessageTextTooLongError,
  type MessageTooManyMediaError,
  SenderNotInChatError,
} from '../../domain/aggregates/chat/errors.js';
import { MessageEntity } from '../../domain/aggregates/message/entity.js';
import {
  ChatEventPublisher,
  ChatIdGenerator,
  ChatRepository,
  MessageRepository,
} from '../ports.js';
import { type Either, isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { ChatId, ChatMessageId, MediaId, UserId } from '@/kernel/domain/ids.js';

export type SendMessageAsUserCommand = {
  chatId: ChatId;
  actorUserId: UserId;
  text: string | null;
  mediaIds: readonly MediaId[];
};

export type SendMessageResult = {
  messageId: ChatMessageId;
  reopened: boolean;
};

type SendError =
  | ChatNotFoundError
  | SenderNotInChatError
  | ChatBlockedError
  | ClaimRequiredError
  | EmptyMessageError
  | MessageTextTooLongError
  | MessageTooManyMediaError;

@Injectable()
export class SendMessageAsUserInteractor {
  public constructor(
    @Inject(ChatRepository) private readonly chatRepo: ChatRepository,
    @Inject(MessageRepository) private readonly messageRepo: MessageRepository,
    @Inject(ChatIdGenerator) private readonly idGen: ChatIdGenerator,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ChatEventPublisher) private readonly publisher: ChatEventPublisher,
  ) {}

  public async execute(
    cmd: SendMessageAsUserCommand,
  ): Promise<Either<SendError, SendMessageResult>> {
    return this.txHost.startTransaction(async (tx) => {
      const chat = await this.chatRepo.findById(tx, cmd.chatId);
      if (!chat) return Left(new ChatNotFoundError());

      const userSlot = chat.participants.find(
        (p) => p.kind === 'user' && (p.subjectId ?? '') === (cmd.actorUserId as string),
      );
      if (userSlot === undefined) return Left(new SenderNotInChatError());

      const messageId = this.idGen.generateMessageId();
      const now = this.clock.now();

      const text = cmd.text;
      const result = ChatEntity.sendMessage(chat, {
        type: 'SendMessage',
        message: {
          messageId,
          senderParticipantId: userSlot.id,
          kind: text !== null && text.trim().length > 0 ? 'text' : 'media',
          text,
          mediaIds: cmd.mediaIds,
        },
        now,
      });
      if (isLeft(result)) return result;

      const { state, events } = result.value;

      const pairKey = pairKeyOf(state.participants);
      await this.chatRepo.save(tx, state, pairKey);

      let reopened = false;
      for (const event of events) {
        if (event.type === 'chat.reopened') reopened = true;
        if (event.type === 'chat.message.sent') {
          const msgState = MessageEntity.fromSentEvent(event, cmd.actorUserId);
          await this.messageRepo.save(tx, msgState);
        }
        await this.publisher.publish(tx, event);
      }

      return Right({ messageId, reopened });
    });
  }
}


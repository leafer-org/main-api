import { Inject, Injectable } from '@nestjs/common';

import { ChatEntity } from '../../domain/aggregates/chat/entity.js';
import {
  ChatBlockedError,
  type ClaimRequiredError,
  type EmptyMessageError,
  type ForbiddenPairError,
  type InvalidParticipantsError,
  type MessageTextTooLongError,
  type MessageTooManyMediaError,
  type OrganizationCannotInitiateError,
  SenderNotInChatError,
} from '../../domain/aggregates/chat/errors.js';
import { MessageEntity } from '../../domain/aggregates/message/entity.js';
import { pairKeyOf } from '../pair-key.js';
import {
  ChatEventPublisher,
  ChatIdGenerator,
  ChatRepository,
  MessageRepository,
} from '../ports.js';
import { type Either, isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { ChatId, MediaId, UserId } from '@/kernel/domain/ids.js';

export type OpenChatWithSupportCommand = {
  initiatorUserId: UserId;
  message: { text: string | null; mediaIds: readonly MediaId[] };
};

export type OpenChatResult = {
  chatId: ChatId;
  reused: boolean;
};

type OpenError =
  | EmptyMessageError
  | MessageTextTooLongError
  | MessageTooManyMediaError
  | InvalidParticipantsError
  | ForbiddenPairError
  | OrganizationCannotInitiateError
  | SenderNotInChatError
  | ChatBlockedError
  | ClaimRequiredError;

@Injectable()
export class OpenChatWithSupportInteractor {
  public constructor(
    @Inject(ChatRepository) private readonly chatRepo: ChatRepository,
    @Inject(MessageRepository) private readonly messageRepo: MessageRepository,
    @Inject(ChatIdGenerator) private readonly idGen: ChatIdGenerator,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ChatEventPublisher) private readonly publisher: ChatEventPublisher,
  ) {}

  public async execute(cmd: OpenChatWithSupportCommand): Promise<Either<OpenError, OpenChatResult>> {
    return this.txHost.startTransaction(async (tx) => {
      const pairKey = pairKeyOf([
        { kind: 'user', subjectId: cmd.initiatorUserId as string },
        { kind: 'support', subjectId: null },
      ]);
      const existing = await this.chatRepo.findByPairKey(tx, pairKey);

      if (existing !== null) {
        if (existing.status === 'blocked') return Left(new ChatBlockedError());
        const userSlot = existing.participants.find((p) => p.kind === 'user');
        if (!userSlot) return Left(new SenderNotInChatError());

        const messageId = this.idGen.generateMessageId();
        const sendResult = ChatEntity.sendMessage(existing, {
          type: 'SendMessage',
          message: {
            messageId,
            senderParticipantId: userSlot.id,
            kind: kindOf(cmd.message.text),
            text: cmd.message.text,
            mediaIds: cmd.message.mediaIds,
          },
          now: this.clock.now(),
        });
        if (isLeft(sendResult)) return sendResult;
        await this.persist(tx, sendResult.value, cmd.initiatorUserId, pairKey);
        return Right({ chatId: existing.chatId, reused: true });
      }

      const chatId = this.idGen.generateChatId();
      const userPid = this.idGen.generateParticipantId();
      const supportPid = this.idGen.generateParticipantId();
      const messageId = this.idGen.generateMessageId();

      const result = ChatEntity.open({
        type: 'OpenChat',
        chatId,
        participants: [
          {
            id: userPid,
            kind: 'user',
            subjectId: cmd.initiatorUserId as string,
            assignedUserId: cmd.initiatorUserId,
          },
          { id: supportPid, kind: 'support', subjectId: null, assignedUserId: null },
        ],
        contextItemId: null,
        firstMessage: {
          messageId,
          senderParticipantId: userPid,
          kind: kindOf(cmd.message.text),
          text: cmd.message.text,
          mediaIds: cmd.message.mediaIds,
        },
        now: this.clock.now(),
      });
      if (isLeft(result)) return result;

      await this.persist(tx, result.value, cmd.initiatorUserId, pairKey);
      return Right({ chatId, reused: false });
    });
  }

  private async persist(
    tx: import('@/kernel/application/ports/tx-host.js').Transaction,
    payload: { state: import('../../domain/aggregates/chat/state.js').ChatState; events: ReadonlyArray<import('../../domain/aggregates/chat/events.js').ChatEvent> },
    actorUserId: UserId,
    pairKey: string,
  ): Promise<void> {
    await this.chatRepo.save(tx, payload.state, pairKey);
    for (const event of payload.events) {
      if (event.type === 'chat.message.sent') {
        await this.messageRepo.save(tx, MessageEntity.fromSentEvent(event, actorUserId));
      }
      await this.publisher.publish(tx, event);
    }
  }
}

function kindOf(text: string | null): 'text' | 'media' {
  return text !== null && text.trim().length > 0 ? 'text' : 'media';
}

import { Inject, Injectable } from '@nestjs/common';

import { ChatEntity } from '../../domain/aggregates/chat/entity.js';
import {
  type ChatBlockedError,
  ChatNotFoundError,
  type ClaimRequiredError,
  type EmptyMessageError,
  type MessageTextTooLongError,
  type MessageTooManyMediaError,
  SenderNotInChatError,
  type SlotAlreadyClaimedError,
} from '../../domain/aggregates/chat/errors.js';
import { MessageEntity } from '../../domain/aggregates/message/entity.js';
import { NotAChatResponderError } from '../errors.js';
import { pairKeyOf } from '../pair-key.js';
import {
  ChatEventPublisher,
  ChatIdGenerator,
  ChatRepository,
  MessageRepository,
  SlotPoolResolver,
} from '../ports.js';
import { type Either, isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { ChatId, ChatMessageId, MediaId, UserId } from '@/kernel/domain/ids.js';

export type SendMessageAsOperatorCommand = {
  chatId: ChatId;
  actorUserId: UserId;
  text: string | null;
  mediaIds: readonly MediaId[];
  withClaim: boolean;
};

export type SendMessageAsOperatorResult = {
  messageId: ChatMessageId;
  claimed: boolean;
};

type SendError =
  | ChatNotFoundError
  | SenderNotInChatError
  | NotAChatResponderError
  | SlotAlreadyClaimedError
  | ChatBlockedError
  | ClaimRequiredError
  | EmptyMessageError
  | MessageTextTooLongError
  | MessageTooManyMediaError
  | import('../../domain/aggregates/chat/errors.js').SlotNotClaimableError
  | import('../../domain/aggregates/chat/errors.js').ChatNotOpenError
  | import('../../domain/aggregates/chat/errors.js').ParticipantNotFoundError;

@Injectable()
export class SendMessageAsOperatorInteractor {
  public constructor(
    @Inject(ChatRepository) private readonly chatRepo: ChatRepository,
    @Inject(MessageRepository) private readonly messageRepo: MessageRepository,
    @Inject(ChatIdGenerator) private readonly idGen: ChatIdGenerator,
    @Inject(SlotPoolResolver) private readonly resolver: SlotPoolResolver,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ChatEventPublisher) private readonly publisher: ChatEventPublisher,
  ) {}

  public async execute(
    cmd: SendMessageAsOperatorCommand,
  ): Promise<Either<SendError, SendMessageAsOperatorResult>> {
    return this.txHost.startTransaction(async (tx) => {
      const chat = await this.chatRepo.findById(tx, cmd.chatId);
      if (!chat) return Left(new ChatNotFoundError());

      // Find operator slot — kind != 'user' where user can act.
      const myAssigned = chat.participants.find(
        (p) =>
          p.kind !== 'user' &&
          p.assignedUserId !== null &&
          (p.assignedUserId as string) === (cmd.actorUserId as string),
      );

      let claimed = false;
      let workingChat = chat;

      if (myAssigned === undefined) {
        if (!cmd.withClaim) return Left(new NotAChatResponderError());

        // Need to claim a slot. Find first operator slot user is allowed to claim.
        const candidates = chat.participants.filter((p) => p.kind !== 'user');
        let claimable: typeof candidates[number] | undefined;
        for (const slot of candidates) {
          if (slot.assignedUserId !== null) continue;
          const allowed = await this.resolver.canAssign(slot.kind, slot.subjectId, cmd.actorUserId);
          if (allowed) {
            claimable = slot;
            break;
          }
        }
        if (!claimable) return Left(new NotAChatResponderError());

        const claimResult = ChatEntity.claimSlot(chat, {
          type: 'ClaimSlot',
          participantId: claimable.id,
          userId: cmd.actorUserId,
          systemMessageId: this.idGen.generateMessageId(),
          now: this.clock.now(),
        });
        if (isLeft(claimResult)) return claimResult;

        workingChat = claimResult.value.state;
        claimed = true;

        for (const event of claimResult.value.events) {
          if (event.type === 'chat.message.sent') {
            await this.messageRepo.save(tx, MessageEntity.fromSentEvent(event, null));
          }
          await this.publisher.publish(tx, event);
        }
      }

      const sender = workingChat.participants.find(
        (p) =>
          p.kind !== 'user' &&
          p.assignedUserId !== null &&
          (p.assignedUserId as string) === (cmd.actorUserId as string),
      );
      if (!sender) return Left(new SenderNotInChatError());

      const messageId = this.idGen.generateMessageId();
      const sendResult = ChatEntity.sendMessage(workingChat, {
        type: 'SendMessage',
        message: {
          messageId,
          senderParticipantId: sender.id,
          kind: cmd.text !== null && cmd.text.trim().length > 0 ? 'text' : 'media',
          text: cmd.text,
          mediaIds: cmd.mediaIds,
        },
        now: this.clock.now(),
      });
      if (isLeft(sendResult)) return sendResult;

      const { state, events } = sendResult.value;
      await this.chatRepo.save(tx, state, pairKeyOf(state.participants));

      for (const event of events) {
        if (event.type === 'chat.message.sent') {
          await this.messageRepo.save(tx, MessageEntity.fromSentEvent(event, cmd.actorUserId));
        }
        await this.publisher.publish(tx, event);
      }

      return Right({ messageId, claimed });
    });
  }
}

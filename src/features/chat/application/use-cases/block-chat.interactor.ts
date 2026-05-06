import { Inject, Injectable } from '@nestjs/common';

import { ChatEntity } from '../../domain/aggregates/chat/entity.js';
import {
  type CannotActAsUserError,
  type ChatNotBlockedError,
  ChatNotFoundError,
  type ChatNotOpenError,
  type ClaimRequiredError,
  type ParticipantNotFoundError,
} from '../../domain/aggregates/chat/errors.js';
import { MessageEntity } from '../../domain/aggregates/message/entity.js';
import { NotAChatResponderError } from '../errors.js';
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
import type { ChatId, UserId } from '@/kernel/domain/ids.js';

export type BlockChatCommand = {
  chatId: ChatId;
  actorUserId: UserId;
  reason: string | null;
};

export type UnblockChatCommand = {
  chatId: ChatId;
  actorUserId: UserId;
};

export type CloseChatCommand = {
  chatId: ChatId;
  actorUserId: UserId;
  reason: string | null;
};

type BlockError =
  | ChatNotFoundError
  | ParticipantNotFoundError
  | CannotActAsUserError
  | ClaimRequiredError
  | ChatNotOpenError
  | NotAChatResponderError;

type UnblockError =
  | ChatNotFoundError
  | ParticipantNotFoundError
  | CannotActAsUserError
  | ClaimRequiredError
  | ChatNotBlockedError
  | NotAChatResponderError;

type CloseError = BlockError;

abstract class ChatLifecycleBase {
  public constructor(
    protected readonly chatRepo: ChatRepository,
    protected readonly messageRepo: MessageRepository,
    protected readonly idGen: ChatIdGenerator,
    protected readonly txHost: TransactionHost,
    protected readonly clock: Clock,
    protected readonly publisher: ChatEventPublisher,
  ) {}

  protected operatorSlotFor(chat: { participants: ReadonlyArray<{ id: unknown; kind: string; assignedUserId: UserId | null }> }, userId: UserId) {
    return chat.participants.find(
      (p) =>
        p.kind !== 'user' &&
        p.assignedUserId !== null &&
        (p.assignedUserId as string) === (userId as string),
    );
  }
}

@Injectable()
export class BlockChatInteractor extends ChatLifecycleBase {
  public constructor(
    @Inject(ChatRepository) chatRepo: ChatRepository,
    @Inject(MessageRepository) messageRepo: MessageRepository,
    @Inject(ChatIdGenerator) idGen: ChatIdGenerator,
    @Inject(TransactionHost) txHost: TransactionHost,
    @Inject(Clock) clock: Clock,
    @Inject(ChatEventPublisher) publisher: ChatEventPublisher,
  ) {
    super(chatRepo, messageRepo, idGen, txHost, clock, publisher);
  }

  public async execute(cmd: BlockChatCommand): Promise<Either<BlockError, void>> {
    return this.txHost.startTransaction(async (tx) => {
      const chat = await this.chatRepo.findById(tx, cmd.chatId);
      if (!chat) return Left(new ChatNotFoundError());

      const slot = this.operatorSlotFor(chat, cmd.actorUserId);
      if (!slot) return Left(new NotAChatResponderError());

      const result = ChatEntity.blockChat(chat, {
        type: 'BlockChat',
        byParticipantId: slot.id as never,
        reason: cmd.reason,
        systemMessageId: this.idGen.generateMessageId(),
        now: this.clock.now(),
      });
      if (isLeft(result)) return result;

      const { state, events } = result.value;
      await this.chatRepo.save(tx, state, pairKeyOf(state.participants));
      for (const event of events) {
        if (event.type === 'chat.message.sent') {
          await this.messageRepo.save(tx, MessageEntity.fromSentEvent(event, null));
        }
        await this.publisher.publish(tx, event);
      }
      return Right(undefined);
    });
  }
}

@Injectable()
export class UnblockChatInteractor extends ChatLifecycleBase {
  public constructor(
    @Inject(ChatRepository) chatRepo: ChatRepository,
    @Inject(MessageRepository) messageRepo: MessageRepository,
    @Inject(ChatIdGenerator) idGen: ChatIdGenerator,
    @Inject(TransactionHost) txHost: TransactionHost,
    @Inject(Clock) clock: Clock,
    @Inject(ChatEventPublisher) publisher: ChatEventPublisher,
  ) {
    super(chatRepo, messageRepo, idGen, txHost, clock, publisher);
  }

  public async execute(cmd: UnblockChatCommand): Promise<Either<UnblockError, void>> {
    return this.txHost.startTransaction(async (tx) => {
      const chat = await this.chatRepo.findById(tx, cmd.chatId);
      if (!chat) return Left(new ChatNotFoundError());

      const slot = this.operatorSlotFor(chat, cmd.actorUserId);
      if (!slot) return Left(new NotAChatResponderError());

      const result = ChatEntity.unblockChat(chat, {
        type: 'UnblockChat',
        byParticipantId: slot.id as never,
        systemMessageId: this.idGen.generateMessageId(),
        now: this.clock.now(),
      });
      if (isLeft(result)) return result;

      const { state, events } = result.value;
      await this.chatRepo.save(tx, state, pairKeyOf(state.participants));
      for (const event of events) {
        if (event.type === 'chat.message.sent') {
          await this.messageRepo.save(tx, MessageEntity.fromSentEvent(event, null));
        }
        await this.publisher.publish(tx, event);
      }
      return Right(undefined);
    });
  }
}

@Injectable()
export class CloseChatInteractor extends ChatLifecycleBase {
  public constructor(
    @Inject(ChatRepository) chatRepo: ChatRepository,
    @Inject(MessageRepository) messageRepo: MessageRepository,
    @Inject(ChatIdGenerator) idGen: ChatIdGenerator,
    @Inject(TransactionHost) txHost: TransactionHost,
    @Inject(Clock) clock: Clock,
    @Inject(ChatEventPublisher) publisher: ChatEventPublisher,
  ) {
    super(chatRepo, messageRepo, idGen, txHost, clock, publisher);
  }

  public async execute(cmd: CloseChatCommand): Promise<Either<CloseError, void>> {
    return this.txHost.startTransaction(async (tx) => {
      const chat = await this.chatRepo.findById(tx, cmd.chatId);
      if (!chat) return Left(new ChatNotFoundError());

      const slot = this.operatorSlotFor(chat, cmd.actorUserId);
      if (!slot) return Left(new NotAChatResponderError());

      const result = ChatEntity.closeChat(chat, {
        type: 'CloseChat',
        byParticipantId: slot.id as never,
        reason: cmd.reason,
        systemMessageId: this.idGen.generateMessageId(),
        now: this.clock.now(),
      });
      if (isLeft(result)) return result;

      const { state, events } = result.value;
      await this.chatRepo.save(tx, state, pairKeyOf(state.participants));
      for (const event of events) {
        if (event.type === 'chat.message.sent') {
          await this.messageRepo.save(tx, MessageEntity.fromSentEvent(event, null));
        }
        await this.publisher.publish(tx, event);
      }
      return Right(undefined);
    });
  }
}

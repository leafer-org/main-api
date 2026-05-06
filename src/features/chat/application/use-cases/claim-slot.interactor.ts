import { Inject, Injectable } from '@nestjs/common';

import { ChatEntity } from '../../domain/aggregates/chat/entity.js';
import {
  ChatNotFoundError,
  type ChatNotOpenError,
  type ParticipantNotFoundError,
  type SlotAlreadyClaimedError,
  type SlotNotClaimableError,
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
import type { ChatId, ChatParticipantId, UserId } from '@/kernel/domain/ids.js';

export type ClaimSlotCommand = {
  chatId: ChatId;
  participantId: ChatParticipantId;
  actorUserId: UserId;
};

type ClaimError =
  | ChatNotFoundError
  | ParticipantNotFoundError
  | SlotNotClaimableError
  | SlotAlreadyClaimedError
  | ChatNotOpenError
  | NotAChatResponderError;

@Injectable()
export class ClaimSlotInteractor {
  public constructor(
    @Inject(ChatRepository) private readonly chatRepo: ChatRepository,
    @Inject(MessageRepository) private readonly messageRepo: MessageRepository,
    @Inject(ChatIdGenerator) private readonly idGen: ChatIdGenerator,
    @Inject(SlotPoolResolver) private readonly resolver: SlotPoolResolver,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ChatEventPublisher) private readonly publisher: ChatEventPublisher,
  ) {}

  public async execute(cmd: ClaimSlotCommand): Promise<Either<ClaimError, void>> {
    return this.txHost.startTransaction(async (tx) => {
      const chat = await this.chatRepo.findById(tx, cmd.chatId);
      if (!chat) return Left(new ChatNotFoundError());

      const slot = chat.participants.find((p) => (p.id as string) === (cmd.participantId as string));
      if (!slot) return Left(new ChatNotFoundError());

      const allowed = await this.resolver.canAssign(slot.kind, slot.subjectId, cmd.actorUserId);
      if (!allowed) return Left(new NotAChatResponderError());

      const result = ChatEntity.claimSlot(chat, {
        type: 'ClaimSlot',
        participantId: cmd.participantId,
        userId: cmd.actorUserId,
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

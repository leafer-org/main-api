import { Inject, Injectable } from '@nestjs/common';

import { ChatEntity } from '../../domain/aggregates/chat/entity.js';
import { ChatNotFoundError } from '../../domain/aggregates/chat/errors.js';
import { NotAChatResponderError } from '../errors.js';
import { pairKeyOf } from '../pair-key.js';
import { ChatEventPublisher, ChatRepository } from '../ports.js';
import { type Either, isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { ChatId, ChatMessageId, UserId } from '@/kernel/domain/ids.js';

export type MarkReadCommand = {
  chatId: ChatId;
  actorUserId: UserId;
  upToMessageId: ChatMessageId;
};

type MarkReadError = ChatNotFoundError | NotAChatResponderError;

@Injectable()
export class MarkReadInteractor {
  public constructor(
    @Inject(ChatRepository) private readonly chatRepo: ChatRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ChatEventPublisher) private readonly publisher: ChatEventPublisher,
  ) {}

  public async execute(cmd: MarkReadCommand): Promise<Either<MarkReadError, void>> {
    return this.txHost.startTransaction(async (tx) => {
      const chat = await this.chatRepo.findById(tx, cmd.chatId);
      if (!chat) return Left(new ChatNotFoundError());

      const myParticipant = chat.participants.find((p) => {
        if (p.kind === 'user') return (p.subjectId ?? '') === (cmd.actorUserId as string);
        return p.assignedUserId !== null && (p.assignedUserId as string) === (cmd.actorUserId as string);
      });
      if (!myParticipant) return Left(new NotAChatResponderError());

      // No-op if already at or past upToMessageId.
      if (
        myParticipant.lastReadMessageId !== null &&
        (myParticipant.lastReadMessageId as string) === (cmd.upToMessageId as string)
      ) {
        return Right(undefined);
      }

      const result = ChatEntity.markRead(chat, {
        type: 'MarkRead',
        participantId: myParticipant.id,
        upToMessageId: cmd.upToMessageId,
        now: this.clock.now(),
      });
      if (isLeft(result)) return Left(new ChatNotFoundError());

      const { state, events } = result.value;
      await this.chatRepo.save(tx, state, pairKeyOf(state.participants));
      for (const event of events) {
        await this.publisher.publish(tx, event);
      }
      return Right(undefined);
    });
  }
}

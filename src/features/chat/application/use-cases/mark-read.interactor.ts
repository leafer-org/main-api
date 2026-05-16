import { Inject, Injectable } from '@nestjs/common';

import { ChatEntity } from '../../domain/aggregates/chat/entity.js';
import { ChatNotFoundError } from '../../domain/aggregates/chat/errors.js';
import type { ChatParticipant } from '../../domain/aggregates/chat/state.js';
import { NotAChatResponderError } from '../errors.js';
import { pairKeyOf } from '../pair-key.js';
import { ChatEventPublisher, ChatRepository, SlotPoolResolver } from '../ports.js';
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
    @Inject(SlotPoolResolver) private readonly slotPool: SlotPoolResolver,
  ) {}

  public async execute(cmd: MarkReadCommand): Promise<Either<MarkReadError, void>> {
    return this.txHost.startTransaction(async (tx) => {
      const chat = await this.chatRepo.findById(tx, cmd.chatId);
      if (!chat) return Left(new ChatNotFoundError());

      // Все slot'ы, через которые actor видит чат. Их может быть несколько:
      // напр. user одновременно клиент в чате (user-slot) И member той же
      // организации (org-slot, member-без-claim). Cursor нужно завести
      // на каждом, иначе query через любой не-cursored slot посчитает чат
      // непрочитанным (дубль-counting в GROUP BY chat_id).
      const participants = await this.resolveParticipants(chat.participants, cmd.actorUserId);
      if (participants.length === 0) return Left(new NotAChatResponderError());

      const now = this.clock.now();
      const allEvents = [];
      let lastState = chat;
      for (const participant of participants) {
        const result = ChatEntity.markRead(lastState, {
          type: 'MarkRead',
          participantId: participant.id,
          readerUserId: cmd.actorUserId,
          upToMessageId: cmd.upToMessageId,
          now,
        });
        if (isLeft(result)) return Left(new ChatNotFoundError());
        lastState = result.value.state;
        allEvents.push(...result.value.events);
      }

      await this.chatRepo.save(tx, lastState, pairKeyOf(lastState.participants));
      for (const event of allEvents) {
        await this.publisher.publish(tx, event);
      }
      return Right(undefined);
    });
  }

  /**
   * Возвращает все slot'ы, через которые actor имеет доступ к чату:
   *  1) user-slot с subjectId == actor,
   *  2) operator-slot, который actor уже claim'нул,
   *  3) не-claim'нутый operator-slot из shared-pool (member орг / support).
   *
   * Может вернуть несколько — на каждый нужен персональный cursor.
   * Идемпотентность mark-read обеспечивает projection handler.
   */
  private async resolveParticipants(
    participants: ReadonlyArray<ChatParticipant>,
    actorUserId: UserId,
  ): Promise<ChatParticipant[]> {
    const actor = actorUserId as string;
    const matched: ChatParticipant[] = [];
    for (const p of participants) {
      if (p.kind === 'user' && p.subjectId === actor) {
        matched.push(p);
        continue;
      }
      if (p.assignedUserId !== null && (p.assignedUserId as string) === actor) {
        matched.push(p);
        continue;
      }
      if (p.kind !== 'user' && p.assignedUserId === null) {
        const allowed = await this.slotPool.canAssign(p.kind, p.subjectId, actorUserId);
        if (allowed) matched.push(p);
      }
    }
    return matched;
  }
}

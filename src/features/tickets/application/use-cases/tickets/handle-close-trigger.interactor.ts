import { Inject, Injectable } from '@nestjs/common';

import { TicketEntity } from '../../../domain/aggregates/ticket/entity.js';
import { type CloseEvent, mapCloseEventToTrigger } from '../../../domain/events/close-events.js';
import { BoardRepository, TicketRepository } from '../../ports.js';
import { isLeft } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import { UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class HandleCloseTriggerInteractor {
  public constructor(
    @Inject(TicketRepository) private readonly ticketRepo: TicketRepository,
    @Inject(BoardRepository) private readonly boardRepo: BoardRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async execute(event: CloseEvent): Promise<void> {
    const mapped = mapCloseEventToTrigger(event);

    await this.txHost.startTransaction(async (tx) => {
      const tickets = await this.ticketRepo.findOpenByTriggerAndEntityId(
        tx,
        mapped.triggerId,
        mapped.entityId,
      );

      for (const ticket of tickets) {
        const board = await this.boardRepo.findById(tx, ticket.boardId);
        if (!board?.closeTrigger) continue;
        if (board.closeTrigger.type !== 'on-moderation-resolved') continue;

        let currentState = ticket;

        if (board.closeTrigger.addComment) {
          const commentText =
            mapped.resolution === 'approved'
              ? 'Модерация: одобрено'
              : 'Модерация: отклонено';

          const commentResult = TicketEntity.comment(currentState, {
            type: 'CommentTicket',
            authorId: UserId.raw('system'),
            text: commentText,
            now: this.clock.now(),
          });

          if (!isLeft(commentResult)) {
            currentState = commentResult.value.state;
          }
        }

        // markDone requires in-progress status — assign to system first if open
        if (currentState.status === 'open') {
          const assignResult = TicketEntity.assign(currentState, {
            type: 'AssignTicket',
            assigneeId: UserId.raw('system'),
            now: this.clock.now(),
          });
          if (isLeft(assignResult)) continue;
          currentState = assignResult.value.state;
        }

        if (currentState.status === 'in-progress') {
          const doneResult = TicketEntity.markDone(currentState, {
            type: 'MarkDone',
            now: this.clock.now(),
          });
          if (isLeft(doneResult)) continue;
          currentState = doneResult.value.state;
        }

        await this.ticketRepo.save(tx, currentState);
      }
    });
  }
}

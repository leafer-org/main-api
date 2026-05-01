import { Inject, Injectable } from '@nestjs/common';

import { TicketEntity } from '../../../domain/aggregates/ticket/entity.js';
import {
  type CloseEvent,
  getOpenTriggerId,
  mapCloseEventToTrigger,
} from '../../../domain/events/close-events.js';
import { matchesSubscriptionFilters } from '../../../domain/services/subscription-filter.service.js';
import { BoardRepository, TicketRepository } from '../../ports.js';
import { isLeft } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import { UserId } from '@/kernel/domain/ids.js';
import type { TicketState } from '../../../domain/aggregates/ticket/state.js';

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
    const openTriggerId = getOpenTriggerId(event);

    await this.txHost.startTransaction(async (tx) => {
      // Find tickets created by the open trigger for this entity
      const tickets = await this.ticketRepo.findActiveByTriggerAndEntityId(
        tx,
        openTriggerId,
        mapped.entityId,
      );

      for (const ticket of tickets) {
        const board = await this.boardRepo.findById(tx, ticket.boardId);
        if (!board) continue;

        // 1. Check redirect subscriptions first (redirect > close priority)
        const redirectSub = board.redirectSubscriptions.find(
          (sub) =>
            sub.triggerId === mapped.triggerId &&
            matchesSubscriptionFilters(sub, mapped.entityId),
        );

        if (redirectSub) {
          let currentState: TicketState = ticket;

          if (redirectSub.addComment) {
            const commentText =
              redirectSub.commentTemplate || `Перенаправлен с доски ${board.name}`;
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

          // Move ticket — include targetBoardId in allowed list so the check passes
          const moveResult = TicketEntity.move(currentState, {
            type: 'MoveTicket',
            toBoardId: redirectSub.targetBoardId,
            movedBy: UserId.raw('system'),
            comment: '',
            allowedTransferBoardIds: [redirectSub.targetBoardId],
            now: this.clock.now(),
          });

          if (!isLeft(moveResult)) {
            await this.ticketRepo.save(tx, moveResult.value.state);
          }
          continue; // redirect takes priority, skip close check
        }

        // 2. Check close subscriptions
        const closeSub = board.closeSubscriptions.find(
          (sub) =>
            sub.triggerId === mapped.triggerId &&
            matchesSubscriptionFilters(sub, mapped.entityId),
        );

        if (closeSub) {
          let currentState: TicketState = ticket;

          if (closeSub.addComment) {
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
      }
    });
  }
}

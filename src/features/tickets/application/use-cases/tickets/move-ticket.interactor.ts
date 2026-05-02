import { Inject, Injectable } from '@nestjs/common';

import { BoardNotFoundError } from '../../../domain/aggregates/board/errors.js';
import { TicketEntity } from '../../../domain/aggregates/ticket/entity.js';
import { TicketNotFoundError } from '../../../domain/aggregates/ticket/errors.js';
import type { TicketRealtimeEvent } from '../../../domain/events/realtime-events.js';
import { BoardRepository, TicketEventPublisher, TicketRepository } from '../../ports.js';
import { isLeft, Left } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { BoardId, TicketId, UserId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class MoveTicketInteractor {
  public constructor(
    @Inject(TicketRepository) private readonly ticketRepo: TicketRepository,
    @Inject(BoardRepository) private readonly boardRepo: BoardRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
    @Inject(TicketEventPublisher) private readonly publisher: TicketEventPublisher,
  ) {}

  public async execute(command: {
    ticketId: TicketId;
    toBoardId: BoardId;
    movedBy: UserId;
    comment: string;
  }) {
    const auth = await this.permissionCheck.mustCan(Permission.TicketMove);
    if (isLeft(auth)) return auth;

    let eventToPublish: TicketRealtimeEvent | null = null;

    const txResult = await this.txHost.startTransaction(async (tx) => {
      const ticket = await this.ticketRepo.findById(tx, command.ticketId);
      if (!ticket) return Left(new TicketNotFoundError());

      const board = await this.boardRepo.findById(tx, ticket.boardId);
      if (!board) return Left(new BoardNotFoundError());

      const fromBoardId = ticket.boardId;
      const now = this.clock.now();

      const result = TicketEntity.move(ticket, {
        type: 'MoveTicket',
        toBoardId: command.toBoardId,
        movedBy: command.movedBy,
        comment: command.comment,
        allowedTransferBoardIds: board.allowedTransferBoardIds,
        now,
      });

      if (isLeft(result)) return result;

      await this.ticketRepo.save(tx, result.value.state);

      eventToPublish = {
        type: 'ticket.moved',
        ticketId: result.value.state.ticketId,
        fromBoardId,
        toBoardId: command.toBoardId,
        movedBy: command.movedBy,
      };

      return { type: 'success' as const, value: result.value.state };
    });

    if (isLeft(txResult)) return txResult;
    if (eventToPublish) await this.publisher.publish(eventToPublish);

    return txResult;
  }
}

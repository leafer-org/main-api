import { Inject, Injectable } from '@nestjs/common';

import { BoardNotFoundError } from '../../../domain/aggregates/board/errors.js';
import { TicketEntity } from '../../../domain/aggregates/ticket/entity.js';
import { TicketNotFoundError } from '../../../domain/aggregates/ticket/errors.js';
import { NotABoardMemberError } from '../../errors.js';
import { BoardRepository, TicketRepository } from '../../ports.js';
import { isLeft, Left } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { TicketId, UserId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class ReassignTicketInteractor {
  public constructor(
    @Inject(TicketRepository) private readonly ticketRepo: TicketRepository,
    @Inject(BoardRepository) private readonly boardRepo: BoardRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(command: { ticketId: TicketId; assigneeId: UserId; reassignedBy: UserId }) {
    const auth = await this.permissionCheck.mustCan(Permission.TicketReassign);
    if (isLeft(auth)) return auth;

    return this.txHost.startTransaction(async (tx) => {
      const ticket = await this.ticketRepo.findById(tx, command.ticketId);
      if (!ticket) return Left(new TicketNotFoundError());

      const board = await this.boardRepo.findById(tx, ticket.boardId);
      if (!board) return Left(new BoardNotFoundError());

      const isMember = board.memberIds.some(
        (id) => (id as string) === (command.assigneeId as string),
      );
      if (!isMember) return Left(new NotABoardMemberError());

      const now = this.clock.now();

      const result = TicketEntity.reassign(ticket, {
        type: 'ReassignTicket',
        assigneeId: command.assigneeId,
        reassignedBy: command.reassignedBy,
        now,
      });

      if (isLeft(result)) return result;

      await this.ticketRepo.save(tx, result.value.state);

      return { type: 'success' as const, value: result.value.state };
    });
  }
}

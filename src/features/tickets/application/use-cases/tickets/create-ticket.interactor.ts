import { Inject, Injectable } from '@nestjs/common';

import { BoardNotFoundError } from '../../../domain/aggregates/board/errors.js';
import { TicketEntity } from '../../../domain/aggregates/ticket/entity.js';
import type { TicketData } from '../../../domain/vo/ticket-data.js';
import { ManualCreationNotAllowedError, NotABoardMemberError } from '../../errors.js';
import {
  BoardRepository,
  TicketEventPublisher,
  TicketIdGenerator,
  TicketRepository,
} from '../../ports.js';
import { isLeft, Left } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { BoardId, UserId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class CreateTicketInteractor {
  public constructor(
    @Inject(TicketRepository) private readonly ticketRepo: TicketRepository,
    @Inject(BoardRepository) private readonly boardRepo: BoardRepository,
    @Inject(TicketIdGenerator) private readonly idGenerator: TicketIdGenerator,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
    @Inject(TicketEventPublisher) private readonly publisher: TicketEventPublisher,
  ) {}

  public async execute(command: {
    boardId: BoardId;
    message: string;
    data: TicketData;
    createdBy: UserId;
  }) {
    const auth = await this.permissionCheck.mustCan(Permission.TicketCreate);
    if (isLeft(auth)) return auth;

    const txResult = await this.txHost.startTransaction(async (tx) => {
      const board = await this.boardRepo.findById(tx, command.boardId);
      if (!board) return Left(new BoardNotFoundError());

      if (!board.manualCreation) return Left(new ManualCreationNotAllowedError());

      const isMember = board.memberIds.some(
        (id) => (id as string) === (command.createdBy as string),
      );
      if (!isMember) return Left(new NotABoardMemberError());

      const ticketId = this.idGenerator.generateTicketId();
      const now = this.clock.now();

      const result = TicketEntity.create({
        type: 'CreateTicket',
        ticketId,
        boardId: command.boardId,
        message: command.message,
        data: command.data,
        triggerId: null,
        eventId: null,
        createdBy: command.createdBy,
        now,
      });

      if (isLeft(result)) return result;

      await this.ticketRepo.save(tx, result.value.state);

      return { type: 'success' as const, value: result.value.state };
    });

    if (isLeft(txResult)) return txResult;

    await this.publisher.publish({
      type: 'ticket.created',
      ticketId: txResult.value.ticketId,
      boardId: txResult.value.boardId,
      triggerId: null,
      createdBy: command.createdBy,
    });

    return txResult;
  }
}

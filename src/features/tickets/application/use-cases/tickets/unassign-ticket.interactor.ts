import { Inject, Injectable } from '@nestjs/common';

import { TicketEntity } from '../../../domain/aggregates/ticket/entity.js';
import { TicketNotFoundError } from '../../../domain/aggregates/ticket/errors.js';
import type { TicketRealtimeEvent } from '../../../domain/events/realtime-events.js';
import { TicketEventPublisher, TicketRepository } from '../../ports.js';
import { isLeft, Left } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { TicketId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class UnassignTicketInteractor {
  public constructor(
    @Inject(TicketRepository) private readonly ticketRepo: TicketRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
    @Inject(TicketEventPublisher) private readonly publisher: TicketEventPublisher,
  ) {}

  public async execute(command: { ticketId: TicketId }) {
    const auth = await this.permissionCheck.mustCan(Permission.TicketUnassign);
    if (isLeft(auth)) return auth;

    let eventToPublish: TicketRealtimeEvent | null = null;

    const txResult = await this.txHost.startTransaction(async (tx) => {
      const ticket = await this.ticketRepo.findById(tx, command.ticketId);
      if (!ticket) return Left(new TicketNotFoundError());

      const oldAssigneeId = ticket.assigneeId;
      const now = this.clock.now();

      const result = TicketEntity.unassign(ticket, {
        type: 'UnassignTicket',
        now,
      });

      if (isLeft(result)) return result;

      await this.ticketRepo.save(tx, result.value.state);

      if (oldAssigneeId) {
        eventToPublish = {
          type: 'ticket.unassigned',
          ticketId: result.value.state.ticketId,
          boardId: result.value.state.boardId,
          oldAssigneeId,
        };
      }

      return { type: 'success' as const, value: result.value.state };
    });

    if (isLeft(txResult)) return txResult;
    if (eventToPublish) await this.publisher.publish(eventToPublish);

    return txResult;
  }
}

import { Inject, Injectable } from '@nestjs/common';

import { TicketEntity } from '../../../domain/aggregates/ticket/entity.js';
import { TicketRepository } from '../../ports.js';
import { isLeft } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { UserId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class UnassignAllTicketsInteractor {
  public constructor(
    @Inject(TicketRepository) private readonly ticketRepo: TicketRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(command: { userId: UserId }) {
    const auth = await this.permissionCheck.mustCan(Permission.TicketUnassign);
    if (isLeft(auth)) return auth;

    return this.txHost.startTransaction(async (tx) => {
      const tickets = await this.ticketRepo.findInProgressByAssignee(tx, command.userId);

      for (const ticket of tickets) {
        const now = this.clock.now();
        const result = TicketEntity.unassign(ticket, { type: 'UnassignTicket', now });
        if (isLeft(result)) continue;
        await this.ticketRepo.save(tx, result.value.state);
      }

      return { type: 'success' as const, value: undefined };
    });
  }
}

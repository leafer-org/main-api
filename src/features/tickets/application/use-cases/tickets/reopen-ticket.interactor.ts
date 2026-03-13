import { Inject, Injectable } from '@nestjs/common';

import { TicketNotFoundError } from '../../../domain/aggregates/ticket/errors.js';
import { TicketEntity } from '../../../domain/aggregates/ticket/entity.js';
import { TicketRepository } from '../../ports.js';
import { Left, isLeft } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { TicketId, UserId } from '@/kernel/domain/ids.js';
import { Permissions } from '@/kernel/domain/permissions.js';

@Injectable()
export class ReopenTicketInteractor {
  public constructor(
    @Inject(TicketRepository) private readonly ticketRepo: TicketRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(command: { ticketId: TicketId; reopenedBy: UserId }) {
    const auth = await this.permissionCheck.mustCan(Permissions.manageTicket);
    if (isLeft(auth)) return auth;

    return this.txHost.startTransaction(async (tx) => {
      const ticket = await this.ticketRepo.findById(tx, command.ticketId);
      if (!ticket) return Left(new TicketNotFoundError());

      const now = this.clock.now();

      const result = TicketEntity.reopen(ticket, {
        type: 'ReopenTicket',
        reopenedBy: command.reopenedBy,
        now,
      });

      if (isLeft(result)) return result;

      await this.ticketRepo.save(tx, result.value.state);

      return { type: 'success' as const, value: result.value.state };
    });
  }
}

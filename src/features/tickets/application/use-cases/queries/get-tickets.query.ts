import { Inject, Injectable } from '@nestjs/common';

import type { TicketStatus } from '../../../domain/aggregates/ticket/state.js';
import { TicketListQueryPort } from '../../ports.js';
import { isLeft } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import type { BoardId, UserId } from '@/kernel/domain/ids.js';
import { Permissions } from '@/kernel/domain/permissions.js';

@Injectable()
export class GetTicketsQuery {
  public constructor(
    @Inject(TicketListQueryPort) private readonly ticketListQuery: TicketListQueryPort,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(params: {
    boardId?: BoardId;
    status?: TicketStatus;
    assigneeId?: UserId;
    from?: number;
    size?: number;
  }) {
    const auth = await this.permissionCheck.mustCan(Permissions.manageTicket);
    if (isLeft(auth)) return auth;

    const result = await this.ticketListQuery.findTickets(params);

    return { type: 'success' as const, value: result };
  }
}

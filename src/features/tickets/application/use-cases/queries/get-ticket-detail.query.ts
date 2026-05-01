import { Inject, Injectable } from '@nestjs/common';

import { TicketNotFoundError } from '../../../domain/aggregates/ticket/errors.js';
import { TicketDetailQueryPort } from '../../ports.js';
import { isLeft, Left } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import type { TicketId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class GetTicketDetailQuery {
  public constructor(
    @Inject(TicketDetailQueryPort) private readonly ticketDetailQuery: TicketDetailQueryPort,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(params: { ticketId: TicketId }) {
    const auth = await this.permissionCheck.mustCan(Permission.TicketRead);
    if (isLeft(auth)) return auth;

    const ticket = await this.ticketDetailQuery.findById(params.ticketId);
    if (!ticket) return Left(new TicketNotFoundError());

    return { type: 'success' as const, value: ticket };
  }
}

import { Inject, Injectable } from '@nestjs/common';

import { MyTicketsQueryPort } from '../../ports.js';
import { isLeft } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import type { UserId } from '@/kernel/domain/ids.js';
import { Permissions } from '@/kernel/domain/permissions.js';

@Injectable()
export class GetMyTicketsQuery {
  public constructor(
    @Inject(MyTicketsQueryPort) private readonly myTicketsQuery: MyTicketsQueryPort,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(params: { userId: UserId; from?: number; size?: number }) {
    const auth = await this.permissionCheck.mustCan(Permissions.manageTicket);
    if (isLeft(auth)) return auth;

    const result = await this.myTicketsQuery.findByAssignee(params.userId, {
      from: params.from,
      size: params.size,
    });

    return { type: 'success' as const, value: result };
  }
}

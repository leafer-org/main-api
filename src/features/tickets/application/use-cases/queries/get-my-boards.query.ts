import { Inject, Injectable } from '@nestjs/common';

import { MyBoardsQueryPort } from '../../ports.js';
import { isLeft } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import type { UserId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class GetMyBoardsQuery {
  public constructor(
    @Inject(MyBoardsQueryPort) private readonly myBoardsQuery: MyBoardsQueryPort,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(params: { userId: UserId }) {
    const auth = await this.permissionCheck.mustCan(Permission.TicketRead);
    if (isLeft(auth)) return auth;

    const boards = await this.myBoardsQuery.findByMember(params.userId);

    return { type: 'success' as const, value: boards };
  }
}

import { Inject, Injectable } from '@nestjs/common';

import type { BoardScope } from '../../../domain/aggregates/board/state.js';
import { BoardListQueryPort } from '../../ports.js';
import { isLeft } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class GetBoardsQuery {
  public constructor(
    @Inject(BoardListQueryPort) private readonly boardListQuery: BoardListQueryPort,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(params?: { scope?: BoardScope }) {
    const auth = await this.permissionCheck.mustCan(Permission.TicketBoardRead);
    if (isLeft(auth)) return auth;

    const boards = await this.boardListQuery.findBoards(params);

    return { type: 'success' as const, value: boards };
  }
}

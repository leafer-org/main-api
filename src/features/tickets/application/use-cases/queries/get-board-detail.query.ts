import { Inject, Injectable } from '@nestjs/common';

import { BoardNotFoundError } from '../../../domain/aggregates/board/errors.js';
import { BoardDetailQueryPort } from '../../ports.js';
import { isLeft, Left } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import type { BoardId } from '@/kernel/domain/ids.js';
import { Permissions } from '@/kernel/domain/permissions.js';

@Injectable()
export class GetBoardDetailQuery {
  public constructor(
    @Inject(BoardDetailQueryPort) private readonly boardDetailQuery: BoardDetailQueryPort,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(params: { boardId: BoardId }) {
    const auth = await this.permissionCheck.mustCan(Permissions.manageTicketBoard);
    if (isLeft(auth)) return auth;

    const board = await this.boardDetailQuery.findById(params.boardId);
    if (!board) return Left(new BoardNotFoundError());

    return { type: 'success' as const, value: board };
  }
}

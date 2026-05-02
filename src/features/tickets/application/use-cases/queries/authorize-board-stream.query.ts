import { Inject, Injectable } from '@nestjs/common';

import { BoardNotFoundError } from '../../../domain/aggregates/board/errors.js';
import { NotABoardMemberError } from '../../errors.js';
import { BoardDetailQueryPort } from '../../ports.js';
import { isLeft, Left } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import type { BoardId, UserId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class AuthorizeBoardStreamQuery {
  public constructor(
    @Inject(BoardDetailQueryPort) private readonly boardDetailQuery: BoardDetailQueryPort,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(params: { boardId: BoardId; userId: UserId }) {
    const auth = await this.permissionCheck.mustCan(Permission.TicketRead);
    if (isLeft(auth)) return auth;

    const board = await this.boardDetailQuery.findById(params.boardId);
    if (!board) return Left(new BoardNotFoundError());

    const isMember = board.memberIds.some((id) => (id as string) === (params.userId as string));
    if (!isMember) return Left(new NotABoardMemberError());

    return { type: 'success' as const, value: { boardId: board.boardId } };
  }
}

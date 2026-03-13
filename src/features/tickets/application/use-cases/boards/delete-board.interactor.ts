import { Inject, Injectable } from '@nestjs/common';

import { BoardNotFoundError } from '../../../domain/aggregates/board/errors.js';
import { BoardRepository } from '../../ports.js';
import { Left, isLeft } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { BoardId } from '@/kernel/domain/ids.js';
import { Permissions } from '@/kernel/domain/permissions.js';

@Injectable()
export class DeleteBoardInteractor {
  public constructor(
    @Inject(BoardRepository) private readonly boardRepo: BoardRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(command: { boardId: BoardId }) {
    const auth = await this.permissionCheck.mustCan(Permissions.manageTicketBoard);
    if (isLeft(auth)) return auth;

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.boardRepo.findById(tx, command.boardId);
      if (!state) return Left(new BoardNotFoundError());

      await this.boardRepo.deleteById(tx, command.boardId);

      return { type: 'success' as const, value: undefined };
    });
  }
}

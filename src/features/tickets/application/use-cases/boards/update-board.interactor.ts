import { Inject, Injectable } from '@nestjs/common';

import { BoardEntity } from '../../../domain/aggregates/board/entity.js';
import { BoardNotFoundError } from '../../../domain/aggregates/board/errors.js';
import { BoardRepository } from '../../ports.js';
import { isLeft, Left } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { BoardId } from '@/kernel/domain/ids.js';
import { Permissions } from '@/kernel/domain/permissions.js';

@Injectable()
export class UpdateBoardInteractor {
  public constructor(
    @Inject(BoardRepository) private readonly boardRepo: BoardRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(command: {
    boardId: BoardId;
    name: string;
    description: string | null;
    manualCreation: boolean;
    allowedTransferBoardIds: BoardId[];
  }) {
    const auth = await this.permissionCheck.mustCan(Permissions.manageTicketBoard);
    if (isLeft(auth)) return auth;

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.boardRepo.findById(tx, command.boardId);
      if (!state) return Left(new BoardNotFoundError());

      const now = this.clock.now();

      const result = BoardEntity.update(state, {
        type: 'UpdateBoard',
        name: command.name,
        description: command.description,
        manualCreation: command.manualCreation,
        allowedTransferBoardIds: command.allowedTransferBoardIds,
        now,
      });

      if (isLeft(result)) return result;

      await this.boardRepo.save(tx, result.value.state);

      return { type: 'success' as const, value: result.value.state };
    });
  }
}

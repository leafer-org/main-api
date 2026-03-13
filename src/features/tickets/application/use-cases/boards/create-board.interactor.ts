import { Inject, Injectable } from '@nestjs/common';

import { BoardEntity } from '../../../domain/aggregates/board/entity.js';
import type { BoardScope } from '../../../domain/aggregates/board/state.js';
import { BoardRepository, TicketIdGenerator } from '../../ports.js';
import { isLeft } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { OrganizationId } from '@/kernel/domain/ids.js';
import { Permissions } from '@/kernel/domain/permissions.js';

@Injectable()
export class CreateBoardInteractor {
  public constructor(
    @Inject(BoardRepository) private readonly boardRepo: BoardRepository,
    @Inject(TicketIdGenerator) private readonly idGenerator: TicketIdGenerator,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(command: {
    name: string;
    description: string | null;
    scope: BoardScope;
    organizationId: OrganizationId | null;
    manualCreation: boolean;
  }) {
    const auth = await this.permissionCheck.mustCan(Permissions.manageTicketBoard);
    if (isLeft(auth)) return auth;

    return this.txHost.startTransaction(async (tx) => {
      const boardId = this.idGenerator.generateBoardId();
      const now = this.clock.now();

      const result = BoardEntity.create({
        type: 'CreateBoard',
        boardId,
        name: command.name,
        description: command.description,
        scope: command.scope,
        organizationId: command.organizationId,
        manualCreation: command.manualCreation,
        now,
      });

      if (isLeft(result)) return result;

      await this.boardRepo.save(tx, result.value.state);

      return { type: 'success' as const, value: result.value.state };
    });
  }
}

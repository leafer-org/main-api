import { Inject, Injectable } from '@nestjs/common';

import { BoardEntity } from '../../../domain/aggregates/board/entity.js';
import { BoardNotFoundError, InvalidTargetBoardError, TargetBoardNotFoundError } from '../../../domain/aggregates/board/errors.js';
import type { SubscriptionFilter } from '../../../domain/vo/filters.js';
import type { TriggerId } from '../../../domain/vo/triggers.js';
import { BoardRepository, TicketIdGenerator } from '../../ports.js';
import { isLeft, Left } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { BoardId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class AddRedirectSubscriptionInteractor {
  public constructor(
    @Inject(BoardRepository) private readonly boardRepo: BoardRepository,
    @Inject(TicketIdGenerator) private readonly idGenerator: TicketIdGenerator,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(command: {
    boardId: BoardId;
    triggerId: TriggerId;
    filters: SubscriptionFilter[];
    targetBoardId: BoardId;
    addComment: boolean;
    commentTemplate: string;
  }) {
    const auth = await this.permissionCheck.mustCan(Permission.TicketBoardSubscriptionAdd);
    if (isLeft(auth)) return auth;

    if ((command.boardId as string) === (command.targetBoardId as string)) {
      return Left(new InvalidTargetBoardError());
    }

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.boardRepo.findById(tx, command.boardId);
      if (!state) return Left(new BoardNotFoundError());

      const targetBoard = await this.boardRepo.findById(tx, command.targetBoardId);
      if (!targetBoard) return Left(new TargetBoardNotFoundError());

      const subscriptionId = this.idGenerator.generateBoardRedirectSubscriptionId();
      const now = this.clock.now();

      const result = BoardEntity.addRedirectSubscription(state, {
        type: 'AddRedirectSubscription',
        subscriptionId,
        triggerId: command.triggerId,
        filters: command.filters,
        targetBoardId: command.targetBoardId,
        addComment: command.addComment,
        commentTemplate: command.commentTemplate,
        now,
      });

      if (isLeft(result)) return result;

      await this.boardRepo.save(tx, result.value.state);

      return { type: 'success' as const, value: result.value.state };
    });
  }
}

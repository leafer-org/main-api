import { Inject, Injectable } from '@nestjs/common';

import { BoardEntity } from '../../../domain/aggregates/board/entity.js';
import { BoardNotFoundError, UserNotFoundByPhoneError } from '../../../domain/aggregates/board/errors.js';
import { BoardRepository } from '../../ports.js';
import { isLeft, Left } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import { UserLookupPort } from '@/kernel/application/ports/user-lookup.js';
import type { BoardId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class AddMemberInteractor {
  public constructor(
    @Inject(BoardRepository) private readonly boardRepo: BoardRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
    @Inject(UserLookupPort) private readonly userLookup: UserLookupPort,
  ) {}

  public async execute(command: { boardId: BoardId; phone: string }) {
    const auth = await this.permissionCheck.mustCan(Permission.TicketBoardMemberAdd);
    if (isLeft(auth)) return auth;

    const user = await this.userLookup.findByPhone(command.phone);
    if (!user) return Left(new UserNotFoundByPhoneError());

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.boardRepo.findById(tx, command.boardId);
      if (!state) return Left(new BoardNotFoundError());

      const now = this.clock.now();

      const result = BoardEntity.addMember(state, {
        type: 'AddMember',
        userId: user.userId,
        now,
      });

      if (isLeft(result)) return result;

      await this.boardRepo.save(tx, result.value.state);

      return { type: 'success' as const, value: result.value.state };
    });
  }
}

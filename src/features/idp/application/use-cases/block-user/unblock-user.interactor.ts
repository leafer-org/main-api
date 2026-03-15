import { Inject, Injectable } from '@nestjs/common';

import { UserEntity } from '../../../domain/aggregates/user/entity.js';
import { UserNotFoundError } from '../../../domain/aggregates/user/user.errors.js';
import { UserRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { UserId } from '@/kernel/domain/ids.js';
import { Permissions } from '@/kernel/domain/permissions.js';

@Injectable()
export class UnblockUserInteractor {
  public constructor(
    @Inject(UserRepository) private readonly userRepository: UserRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(command: { userId: UserId }) {
    const auth = await this.permissionCheck.mustCan(Permissions.manageUser);
    if (isLeft(auth)) return auth;

    return this.txHost.startTransaction(async (tx) => {
      const userState = await this.userRepository.findById(tx, command.userId);
      if (!userState) return Left(new UserNotFoundError());

      const now = this.clock.now();

      const userResult = UserEntity.unblock(userState, {
        type: 'UnblockUser',
        now,
      });
      if (isLeft(userResult)) return userResult;

      await this.userRepository.save(tx, userResult.value.state);

      return Right(undefined);
    });
  }
}

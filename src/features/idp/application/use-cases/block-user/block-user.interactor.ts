import { Inject, Injectable } from '@nestjs/common';

import { SessionEntity } from '../../../domain/aggregates/session/entity.js';
import { UserEntity } from '../../../domain/aggregates/user/entity.js';
import { UserNotFoundError } from '../../../domain/aggregates/user/user.errors.js';
import { whenUserBlockedDeleteSessions } from '../../../domain/policies/when-user-blocked-delete-sessions.policy.js';
import { SessionRepository, UserRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { UserId } from '@/kernel/domain/ids.js';
import { Permissions } from '@/kernel/domain/permissions.js';

@Injectable()
export class BlockUserInteractor {
  public constructor(
    @Inject(UserRepository) private readonly userRepository: UserRepository,
    @Inject(SessionRepository) private readonly sessionRepository: SessionRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(command: { userId: UserId; reason: string }) {
    const auth = await this.permissionCheck.mustCan(Permissions.manageUser);
    if (isLeft(auth)) return auth;

    return this.txHost.startTransaction(async (tx) => {
      const userState = await this.userRepository.findById(tx, command.userId);
      if (!userState) return Left(new UserNotFoundError());

      const now = this.clock.now();

      const userResult = UserEntity.block(userState, {
        type: 'BlockUser',
        reason: command.reason,
        now,
      });
      if (isLeft(userResult)) return userResult;

      await this.userRepository.save(tx, userResult.value.state);

      // Policy: UserBlocked → delete sessions
      const userBlockedEvent = userResult.value.event;
      const sessions = await this.sessionRepository.findByUserId(tx, command.userId);
      for (const session of sessions) {
        const delCmd = whenUserBlockedDeleteSessions(userBlockedEvent);
        const sessionResult = SessionEntity.delete(session, delCmd);
        if (isLeft(sessionResult)) continue;
        // biome-ignore lint/performance/noAwaitInLoops: sequence handling block user
        await this.sessionRepository.deleteById(tx, session.id);
      }

      return Right(undefined);
    });
  }
}

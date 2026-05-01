import { Inject, Injectable } from '@nestjs/common';

import { RoleNotFoundError } from '../../../domain/aggregates/role/errors.js';
import { SessionEntity } from '../../../domain/aggregates/session/entity.js';
import { UserEntity } from '../../../domain/aggregates/user/entity.js';
import { UserNotFoundError } from '../../../domain/aggregates/user/user.errors.js';
import { whenUserRoleUpdatedDeleteSessions } from '../../../domain/policies/when-user-role-updated-delete-sessions.policy.js';
import { RoleRepository, SessionRepository, UserRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { RoleId, UserId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';
import { Role } from '@/kernel/domain/vo/role.js';

@Injectable()
export class UpdateUserRoleInteractor {
  public constructor(
    @Inject(UserRepository) private readonly userRepository: UserRepository,
    @Inject(RoleRepository) private readonly roleRepository: RoleRepository,
    @Inject(SessionRepository) private readonly sessionRepository: SessionRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(command: { userId: UserId; roleId: RoleId }) {
    const auth = await this.permissionCheck.mustCan(Permission.UserRoleAssign);
    if (isLeft(auth)) return auth;

    return this.txHost.startTransaction(async (tx) => {
      // Validate role exists
      const role = await this.roleRepository.findById(tx, command.roleId);
      if (!role) return Left(new RoleNotFoundError());

      // Load user
      const userState = await this.userRepository.findById(tx, command.userId);
      if (!userState) return Left(new UserNotFoundError());

      const now = this.clock.now();

      // Update user role
      const userResult = UserEntity.updateRole(userState, {
        type: 'UpdateUserRole',
        role: Role.raw(role.name),
        now,
      });
      if (isLeft(userResult)) return userResult;

      await this.userRepository.save(tx, userResult.value.state);

      // Policy: UserRoleUpdated → delete sessions
      const userRoleUpdatedEvent = userResult.value.event;
      if (userRoleUpdatedEvent.type === 'user.role_updated') {
        const sessions = await this.sessionRepository.findByUserId(tx, command.userId);
        for (const session of sessions) {
          const delCmd = whenUserRoleUpdatedDeleteSessions(userRoleUpdatedEvent);
          const sessionResult = SessionEntity.delete(session, delCmd);
          if (isLeft(sessionResult)) continue;
          // biome-ignore lint/performance/noAwaitInLoops: sequence handling update role
          await this.sessionRepository.deleteById(tx, session.id);
        }
      }

      return Right(undefined);
    });
  }
}

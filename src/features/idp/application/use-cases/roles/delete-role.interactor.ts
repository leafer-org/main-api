import { Inject, Injectable } from '@nestjs/common';

import { RoleEntity } from '../../../domain/aggregates/role/entity.js';
import { RoleNotFoundError } from '../../../domain/aggregates/role/errors.js';
import { SessionEntity } from '../../../domain/aggregates/session/entity.js';
import { UserEntity } from '../../../domain/aggregates/user/entity.js';
import { whenRoleDeletedUpdateUserRoles } from '../../../domain/policies/when-role-deleted-update-user-roles.policy.js';
import { whenUserRoleUpdatedDeleteSessions } from '../../../domain/policies/when-user-role-updated-delete-sessions.policy.js';
import { RoleRepository, SessionRepository, UserRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { RoleId } from '@/kernel/domain/ids.js';
import { Permissions } from '@/kernel/domain/permissions.js';

@Injectable()
export class DeleteRoleInteractor {
  public constructor(
    @Inject(RoleRepository) private readonly roleRepository: RoleRepository,
    @Inject(UserRepository) private readonly userRepository: UserRepository,
    @Inject(SessionRepository) private readonly sessionRepository: SessionRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(command: { roleId: RoleId; replacementRoleId: RoleId }) {
    const auth = await this.permissionCheck.mustCan(Permissions.manageRole);
    if (isLeft(auth)) return auth;

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.roleRepository.findById(tx, command.roleId);
      if (!state) return Left(new RoleNotFoundError());

      const replacementRole = await this.roleRepository.findById(tx, command.replacementRoleId);
      if (!replacementRole) return Left(new RoleNotFoundError());

      const now = this.clock.now();

      // 1. Delete role aggregate
      const roleResult = RoleEntity.delete(state, {
        type: 'DeleteRole',
        replacementRoleName: replacementRole.name,
      });
      if (isLeft(roleResult)) return roleResult;

      await this.roleRepository.deleteById(tx, command.roleId);

      // 2. Policy chain: RoleDeleted → update users → delete sessions
      const roleDeletedEvent = roleResult.value.event;

      const users = await this.userRepository.findByRoleName(tx, roleDeletedEvent.roleName);

      for (const userState of users) {
        const cmd = whenRoleDeletedUpdateUserRoles(roleDeletedEvent, { now });
        const userResult = UserEntity.updateRole(userState, cmd);
        if (isLeft(userResult)) continue;

        // biome-ignore lint/performance/noAwaitInLoops: normal
        await this.userRepository.save(tx, userResult.value.state);

        // Policy 2: UserRoleUpdated → DeleteSession (per session)
        if (userResult.value.event.type === 'user.role_updated') {
          const sessions = await this.sessionRepository.findByUserId(tx, userState.id);
          for (const session of sessions) {
            const delCmd = whenUserRoleUpdatedDeleteSessions(userResult.value.event);
            const sessionResult = SessionEntity.delete(session, delCmd);
            if (isLeft(sessionResult)) continue;
            // biome-ignore lint/performance/noAwaitInLoops: normal
            await this.sessionRepository.deleteById(tx, session.id);
          }
        }
      }

      return Right(undefined);
    });
  }
}

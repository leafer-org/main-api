import { Inject, Injectable } from '@nestjs/common';

import { roleDecide } from '../../../domain/aggregates/role/decide.js';
import { RoleNotFoundError } from '../../../domain/aggregates/role/errors.js';
import { sessionDecide } from '../../../domain/aggregates/session/decide.js';
import { userApply } from '../../../domain/aggregates/user/apply.js';
import { userDecide } from '../../../domain/aggregates/user/decide.js';
import { whenRoleDeletedUpdateUserRoles } from '../../../domain/policies/when-role-deleted-update-user-roles.policy.js';
import { whenUserRoleUpdatedDeleteSessions } from '../../../domain/policies/when-user-role-updated-delete-sessions.policy.js';
import { RoleRepository, SessionRepository, UserRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { PermissionsStore } from '@/infra/lib/authorization/permissions-store.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { RoleId } from '@/kernel/domain/ids.js';

@Injectable()
export class DeleteRoleInteractor {
  public constructor(
    @Inject(RoleRepository) private readonly roleRepository: RoleRepository,
    @Inject(UserRepository) private readonly userRepository: UserRepository,
    @Inject(SessionRepository) private readonly sessionRepository: SessionRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionsStore) private readonly permissionsStore: PermissionsStore,
  ) {}

  public async execute(command: { roleId: RoleId; replacementRoleId: RoleId }) {
    return this.txHost.startTransaction(async (tx) => {
      const state = await this.roleRepository.findById(tx, command.roleId);
      if (!state) return Left(new RoleNotFoundError());

      const replacementRole = await this.roleRepository.findById(tx, command.replacementRoleId);
      if (!replacementRole) return Left(new RoleNotFoundError());

      const now = this.clock.now();

      // 1. Delete role aggregate
      const eventEither = roleDecide(state, {
        type: 'DeleteRole',
        replacementRoleName: replacementRole.name,
      });
      if (isLeft(eventEither)) return eventEither;

      await this.roleRepository.deleteById(tx, command.roleId);

      // 2. Policy chain: RoleDeleted → update users → delete sessions
      const roleDeletedEvent = eventEither.value;
      if (roleDeletedEvent.type !== 'role.deleted') return Right(undefined);

      const users = await this.userRepository.findByRoleName(tx, roleDeletedEvent.roleName);

      for (const userState of users) {
        const cmd = whenRoleDeletedUpdateUserRoles(roleDeletedEvent, { now });
        const userEventEither = userDecide(userState, cmd);
        if (isLeft(userEventEither)) continue;

        const userEvent = userEventEither.value;
        const newUserState = userApply(userState, userEvent);
        await this.userRepository.save(tx, newUserState);

        // Policy 2: UserRoleUpdated → DeleteSession (per session)
        if (userEvent.type === 'user.role_updated') {
          const sessions = await this.sessionRepository.findByUserId(tx, userState.id);
          for (const session of sessions) {
            const delCmd = whenUserRoleUpdatedDeleteSessions(userEvent);
            const sessionEventEither = sessionDecide(session, delCmd);
            if (isLeft(sessionEventEither)) continue;
            await this.sessionRepository.deleteById(tx, session.id);
          }
        }
      }

      await this.permissionsStore.refresh();

      return Right(undefined);
    });
  }
}

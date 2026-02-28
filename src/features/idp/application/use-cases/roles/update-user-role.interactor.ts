import { Inject, Injectable } from '@nestjs/common';

import { RoleNotFoundError } from '../../../domain/aggregates/role/errors.js';
import { sessionDecide } from '../../../domain/aggregates/session/decide.js';
import { userApply } from '../../../domain/aggregates/user/apply.js';
import { userDecide } from '../../../domain/aggregates/user/decide.js';
import { UserNotFoundError } from '../../../domain/aggregates/user/user.errors.js';
import { whenUserRoleUpdatedDeleteSessions } from '../../../domain/policies/when-user-role-updated-delete-sessions.policy.js';
import { RoleRepository, SessionRepository, UserRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { RoleId, UserId } from '@/kernel/domain/ids.js';
import { Role } from '@/kernel/domain/vo.js';

@Injectable()
export class UpdateUserRoleInteractor {
  public constructor(
    @Inject(UserRepository) private readonly userRepository: UserRepository,
    @Inject(RoleRepository) private readonly roleRepository: RoleRepository,
    @Inject(SessionRepository) private readonly sessionRepository: SessionRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async execute(command: { userId: UserId; roleId: RoleId }) {
    return this.txHost.startTransaction(async (tx) => {
      // Validate role exists
      const role = await this.roleRepository.findById(tx, command.roleId);
      if (!role) return Left(new RoleNotFoundError());

      // Load user
      const userState = await this.userRepository.findById(tx, command.userId);
      if (!userState) return Left(new UserNotFoundError());

      const now = this.clock.now();

      // Update user role
      const eventEither = userDecide(userState, {
        type: 'UpdateUserRole',
        role: Role.raw(role.name),
        now,
      });
      if (isLeft(eventEither)) return eventEither;

      const newUserState = userApply(userState, eventEither.value);
      await this.userRepository.save(tx, newUserState);

      // Policy: UserRoleUpdated → delete sessions
      const userRoleUpdatedEvent = eventEither.value;
      if (userRoleUpdatedEvent.type === 'user.role_updated') {
        const sessions = await this.sessionRepository.findByUserId(tx, command.userId);
        for (const session of sessions) {
          const delCmd = whenUserRoleUpdatedDeleteSessions(userRoleUpdatedEvent);
          const sessionEventEither = sessionDecide(session, delCmd);
          if (isLeft(sessionEventEither)) continue;
          await this.sessionRepository.deleteById(tx, session.id);
        }
      }

      return Right(undefined);
    });
  }
}

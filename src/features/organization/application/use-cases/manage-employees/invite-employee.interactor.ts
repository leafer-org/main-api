import { Inject, Injectable } from '@nestjs/common';

import { OrganizationEntity } from '../../../domain/aggregates/organization/entity.js';
import { OrganizationNotFoundError } from '../../../domain/aggregates/organization/errors.js';
import { OrganizationRepository } from '../../ports.js';
import { OrganizationPermissionCheckService } from '../../organization-permission.js';
import { CreateDomainError } from '@/infra/ddd/error.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import { UserLookupPort } from '@/kernel/application/ports/user-lookup.js';
import type { EmployeeRoleId, OrganizationId, UserId } from '@/kernel/domain/ids.js';

export class UserNotFoundByPhoneError extends CreateDomainError('user_not_found_by_phone', 404) {}

@Injectable()
export class InviteEmployeeInteractor {
  public constructor(
    @Inject(OrganizationRepository) private readonly organizationRepository: OrganizationRepository,
    @Inject(OrganizationPermissionCheckService)
    private readonly permissionCheck: OrganizationPermissionCheckService,
    @Inject(UserLookupPort) private readonly userLookup: UserLookupPort,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async execute(command: {
    organizationId: OrganizationId;
    userId: UserId;
    phone: string;
    roleId: EmployeeRoleId;
  }) {
    const auth = await this.permissionCheck.mustHavePermission(
      command.organizationId,
      command.userId,
      'manage_employees',
    );
    if (isLeft(auth)) return auth;

    const userResult = await this.userLookup.findByPhone(command.phone);
    if (!userResult) return Left(new UserNotFoundByPhoneError());

    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.organizationRepository.findById(tx, command.organizationId);
      if (!state) return Left(new OrganizationNotFoundError());

      const result = OrganizationEntity.inviteEmployee(state, {
        type: 'InviteEmployee',
        userId: userResult.userId,
        roleId: command.roleId,
        now,
      });
      if (isLeft(result)) return result;

      await this.organizationRepository.save(tx, result.value.state);

      return Right(undefined);
    });
  }
}

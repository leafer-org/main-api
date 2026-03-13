import { Inject, Injectable } from '@nestjs/common';

import type { OrganizationPermission } from '../../../domain/aggregates/organization/config.js';
import { OrganizationEntity } from '../../../domain/aggregates/organization/entity.js';
import { OrganizationNotFoundError } from '../../../domain/aggregates/organization/errors.js';
import { OrganizationPermissionCheckService } from '../../organization-permission.js';
import { OrganizationRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { EmployeeRoleId, OrganizationId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class UpdateEmployeeRoleInteractor {
  public constructor(
    @Inject(OrganizationRepository) private readonly organizationRepository: OrganizationRepository,
    @Inject(OrganizationPermissionCheckService)
    private readonly permissionCheck: OrganizationPermissionCheckService,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async execute(command: {
    organizationId: OrganizationId;
    userId: UserId;
    roleId: EmployeeRoleId;
    name: string;
    permissions: OrganizationPermission[];
  }) {
    const auth = await this.permissionCheck.mustHavePermission(
      command.organizationId,
      command.userId,
      'manage_roles',
    );
    if (isLeft(auth)) return auth;

    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.organizationRepository.findById(tx, command.organizationId);
      if (!state) return Left(new OrganizationNotFoundError());

      const result = OrganizationEntity.updateEmployeeRole(state, {
        type: 'UpdateEmployeeRole',
        roleId: command.roleId,
        name: command.name,
        permissions: command.permissions,
        now,
      });
      if (isLeft(result)) return result;

      await this.organizationRepository.save(tx, result.value.state);

      return Right(undefined);
    });
  }
}

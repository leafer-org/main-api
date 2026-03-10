import { Inject, Injectable } from '@nestjs/common';

import type { EmployeeEntity } from '../../domain/aggregates/organization/entity.js';
import type { OrganizationPermission } from '../../domain/aggregates/organization/config.js';
import {
  NotEmployeeError,
  OrgPermissionDeniedError,
  OrganizationPermissionCheckService,
} from '../../application/organization-permission.js';
import { OrganizationRepository } from '../../application/ports.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';
import type { OrganizationId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleOrganizationPermissionCheckService extends OrganizationPermissionCheckService {
  public constructor(
    @Inject(OrganizationRepository) private readonly organizationRepository: OrganizationRepository,
  ) {
    super();
  }

  public async mustBeEmployee(
    organizationId: OrganizationId,
    userId: UserId,
  ): Promise<Either<NotEmployeeError, EmployeeEntity>> {
    const org = await this.organizationRepository.findById(NO_TRANSACTION, organizationId);
    if (!org) return Left(new NotEmployeeError());

    const employee = org.employees.find((e) => e.userId === userId);
    if (!employee) return Left(new NotEmployeeError());

    return Right(employee);
  }

  public async mustHavePermission(
    organizationId: OrganizationId,
    userId: UserId,
    permission: OrganizationPermission,
  ): Promise<Either<OrgPermissionDeniedError, EmployeeEntity>> {
    const org = await this.organizationRepository.findById(NO_TRANSACTION, organizationId);
    if (!org) return Left(new OrgPermissionDeniedError());

    const employee = org.employees.find((e) => e.userId === userId);
    if (!employee) return Left(new OrgPermissionDeniedError());

    const role = org.roles.find((r) => r.id === employee.roleId);
    if (!role || !role.permissions.includes(permission)) {
      return Left(new OrgPermissionDeniedError());
    }

    return Right(employee);
  }
}

import { Inject, Injectable } from '@nestjs/common';

import {
  NotEmployeeError,
  OrganizationPermissionCheckService,
  OrgPermissionDeniedError,
} from '../../application/organization-permission.js';
import { OrganizationRepository } from '../../application/ports.js';
import type { OrganizationPermission } from '../../domain/aggregates/organization/config.js';
import type { EmployeeEntity } from '../../domain/aggregates/organization/entity.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';
import type { EmployeeRoleId, OrganizationId, UserId } from '@/kernel/domain/ids.js';
import { Permissions } from '@/kernel/domain/permissions.js';

const SYNTHETIC_ADMIN_EMPLOYEE: EmployeeEntity = {
  userId: 'system-admin' as UserId,
  roleId: 'system-admin' as EmployeeRoleId,
  isOwner: false,
  joinedAt: new Date(0),
};

@Injectable()
export class DrizzleOrganizationPermissionCheckService extends OrganizationPermissionCheckService {
  public constructor(
    @Inject(OrganizationRepository) private readonly organizationRepository: OrganizationRepository,
    @Inject(PermissionCheckService) private readonly globalPermissionCheck: PermissionCheckService,
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
    if (employee) return Right(employee);

    // manageOrganization and moderateOrganization bypass employee check
    const isManager = await this.globalPermissionCheck.can(Permissions.manageOrganization);
    if (isManager) return Right(SYNTHETIC_ADMIN_EMPLOYEE);

    const isModerator = await this.globalPermissionCheck.can(Permissions.moderateOrganization);
    if (isModerator) return Right(SYNTHETIC_ADMIN_EMPLOYEE);

    return Left(new NotEmployeeError());
  }

  public async mustHavePermission(
    organizationId: OrganizationId,
    userId: UserId,
    permission: OrganizationPermission,
  ): Promise<Either<OrgPermissionDeniedError, EmployeeEntity>> {
    const org = await this.organizationRepository.findById(NO_TRANSACTION, organizationId);
    if (!org) return Left(new OrgPermissionDeniedError());

    // manageOrganization bypasses all org-level permission checks
    const isManager = await this.globalPermissionCheck.can(Permissions.manageOrganization);
    if (isManager) return Right(SYNTHETIC_ADMIN_EMPLOYEE);

    const employee = org.employees.find((e) => e.userId === userId);
    if (!employee) return Left(new OrgPermissionDeniedError());

    const role = org.roles.find((r) => r.id === employee.roleId);
    if (!role || !role.permissions.includes(permission)) {
      return Left(new OrgPermissionDeniedError());
    }

    return Right(employee);
  }

  public async mustCanModerate(): Promise<Either<OrgPermissionDeniedError, void>> {
    const isModerator = await this.globalPermissionCheck.can(Permissions.moderateOrganization);
    if (isModerator) return Right(undefined);

    const isManager = await this.globalPermissionCheck.can(Permissions.manageOrganization);
    if (isManager) return Right(undefined);

    return Left(new OrgPermissionDeniedError());
  }
}

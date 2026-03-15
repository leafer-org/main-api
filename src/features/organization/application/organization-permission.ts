import type { OrganizationPermission } from '../domain/aggregates/organization/config.js';
import type { EmployeeEntity } from '../domain/aggregates/organization/entity.js';
import { CreateDomainError } from '@/infra/ddd/error.js';
import type { Either } from '@/infra/lib/box.js';
import type { OrganizationId, UserId } from '@/kernel/domain/ids.js';

export class NotEmployeeError extends CreateDomainError('not_employee', 403) {}

export class OrgPermissionDeniedError extends CreateDomainError('org_permission_denied', 403) {}

export abstract class OrganizationPermissionCheckService {
  public abstract mustBeEmployee(
    organizationId: OrganizationId,
    userId: UserId,
  ): Promise<Either<NotEmployeeError, EmployeeEntity>>;

  public abstract mustHavePermission(
    organizationId: OrganizationId,
    userId: UserId,
    permission: OrganizationPermission,
  ): Promise<Either<OrgPermissionDeniedError, EmployeeEntity>>;

  /** Allows users with ORGANIZATION.MODERATE or ORGANIZATION.MANAGE global permission */
  public abstract mustCanModerate(): Promise<Either<OrgPermissionDeniedError, void>>;
}

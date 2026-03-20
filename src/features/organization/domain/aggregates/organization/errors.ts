import { CreateDomainError } from '@/infra/ddd/error.js';

export class OrganizationNotFoundError extends CreateDomainError('organization_not_found', 404) {}

export class CannotRemoveOwnerError extends CreateDomainError('cannot_remove_owner', 400) {}

export class EmployeeNotFoundError extends CreateDomainError('employee_not_found', 404) {}

export class EmployeeAlreadyExistsError extends CreateDomainError('employee_already_exists', 409) {}

export class EmployeeLimitReachedError extends CreateDomainError('employee_limit_reached', 400) {}

export class RoleNotFoundError extends CreateDomainError('role_not_found', 404) {}

export class CannotDeleteAdminRoleError extends CreateDomainError(
  'cannot_delete_admin_role',
  400,
) {}

export class InfoNotInDraftError extends CreateDomainError('info_not_in_draft', 400) {}

export class InfoNotInModerationError extends CreateDomainError('info_not_in_moderation', 400) {}

export class TransferTargetNotEmployeeError extends CreateDomainError(
  'transfer_target_not_employee',
  400,
) {}

export class OrganizationAlreadyClaimedError extends CreateDomainError(
  'organization_already_claimed',
  400,
) {}

export class InvalidClaimTokenError extends CreateDomainError('invalid_claim_token', 400) {}

export class InfoNotPublishedError extends CreateDomainError('info_not_published', 400) {}

export class NoDraftChangesToDiscardError extends CreateDomainError('no_draft_changes_to_discard', 400) {}

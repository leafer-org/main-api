import { CreateDomainError } from '@/infra/ddd/error.js';

export class RoleAlreadyExistsError extends CreateDomainError('role_already_exists') {}

export class RoleNotFoundError extends CreateDomainError('role_not_found') {}

export class StaticRoleModificationError extends CreateDomainError('static_role_modification') {}

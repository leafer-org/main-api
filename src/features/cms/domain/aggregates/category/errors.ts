import { CreateDomainError } from '@/infra/ddd/error.js';

export class CategoryAlreadyExistsError extends CreateDomainError('category_already_exists', 400) {}

export class CategoryNotFoundError extends CreateDomainError('category_not_found', 404) {}

export class CategoryNotPublishedError extends CreateDomainError('category_not_published', 400) {}

export class AttributeAlreadyAssignedError extends CreateDomainError(
  'attribute_already_assigned',
  400,
) {}

export class AttributeNotAssignedError extends CreateDomainError('attribute_not_assigned', 400) {}

export class InvalidAllowedTypeIdsError extends CreateDomainError(
  'invalid_allowed_type_ids',
  400,
).withData<{ invalidTypeIds: string[] }>() {}

export class EmptyAllowedTypeIdsError extends CreateDomainError('empty_allowed_type_ids', 400) {}

export class EmptyAgeGroupsError extends CreateDomainError('empty_age_groups', 400) {}

export class InvalidAgeGroupsError extends CreateDomainError(
  'invalid_age_groups',
  400,
).withData<{ invalidAgeGroups: string[] }>() {}

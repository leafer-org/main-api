import { CreateDomainError } from '@/infra/ddd/error.js';

export class BoardNotFoundError extends CreateDomainError('board_not_found', 404) {}

export class MemberAlreadyExistsError extends CreateDomainError('member_already_exists', 409) {}

export class MemberNotFoundError extends CreateDomainError('member_not_found', 404) {}

export class SubscriptionNotFoundError extends CreateDomainError(
  'subscription_not_found',
  404,
) {}

export class AutomationNotFoundError extends CreateDomainError('automation_not_found', 404) {}

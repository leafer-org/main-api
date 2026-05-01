import { CreateDomainError } from '@/infra/ddd/error.js';

export class BoardNotFoundError extends CreateDomainError('board_not_found', 404) {}

export class MemberAlreadyExistsError extends CreateDomainError('member_already_exists', 409) {}

export class MemberNotFoundError extends CreateDomainError('member_not_found', 404) {}

export class SubscriptionNotFoundError extends CreateDomainError('subscription_not_found', 404) {}

export class CloseSubscriptionNotFoundError extends CreateDomainError('close_subscription_not_found', 404) {}

export class RedirectSubscriptionNotFoundError extends CreateDomainError('redirect_subscription_not_found', 404) {}

export class InvalidTargetBoardError extends CreateDomainError('invalid_target_board', 400) {}

export class TargetBoardNotFoundError extends CreateDomainError('target_board_not_found', 404) {}

export class InvalidTriggerIdError extends CreateDomainError('invalid_trigger_id', 400) {}

export class AutomationNotFoundError extends CreateDomainError('automation_not_found', 404) {}

export class UserNotFoundByPhoneError extends CreateDomainError('user_not_found_by_phone', 404) {}

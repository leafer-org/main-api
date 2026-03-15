import { CreateDomainError } from '@/infra/ddd/error.js';

export class UserNotFoundError extends CreateDomainError('user_not_found', 401) {}

export class UserAlreadyExistsError extends CreateDomainError('user_already_exists', 400) {}

export class UserAlreadyBlockedError extends CreateDomainError('user_already_blocked', 400) {}

export class UserNotBlockedError extends CreateDomainError('user_not_blocked', 400) {}

export class UserBlockedError extends CreateDomainError('user_blocked', 403).withData<{
  reason: string;
}>() {}

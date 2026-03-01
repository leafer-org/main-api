import { CreateDomainError } from '@/infra/ddd/error.js';

export class UserNotFoundError extends CreateDomainError('user_not_found', 401) {}

export class UserAlreadyExistsError extends CreateDomainError('user_already_exists', 400) {}

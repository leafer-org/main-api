import { CreateDomainError } from '@/infra/ddd/error.js';

export class UserNotFoundError extends CreateDomainError('user_not_found') {}

export class UserAlreadyExistsError extends CreateDomainError('user_already_exists') {}

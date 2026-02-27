import { CreateDomainError } from '@/infra/ddd/error.js';

export class SessionNotFoundError extends CreateDomainError('session_not_found') {}

export class SessionExpiredError extends CreateDomainError('session_expired') {}

export class SessionAlreadyExistsError extends CreateDomainError('session_already_exists') {}

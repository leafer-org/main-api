import { CreateDomainError } from '@/infra/ddd/error.js';

export class SessionNotFoundError extends CreateDomainError('session_not_found', 401) {}

export class SessionExpiredError extends CreateDomainError('session_expired', 401) {}

export class SessionAlreadyExistsError extends CreateDomainError('session_already_exists', 400) {}

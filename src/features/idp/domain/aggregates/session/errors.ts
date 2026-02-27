import { CreateDomainError } from '@/infra/ddd/error.js';

export class SessionNotFoundError extends CreateDomainError('SessionNotFound') {}

export class SessionExpiredError extends CreateDomainError('SessionExpired') {}

export class SessionAlreadyExistsError extends CreateDomainError('SessionAlreadyExists') {}

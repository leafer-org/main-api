import { CreateDomainError } from '@/infra/ddd/error.js';

export class ServiceNotFoundError extends CreateDomainError('service_not_found') {}

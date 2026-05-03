import { CreateDomainError } from '@/infra/ddd/error.js';

export class OrganizationNotFoundError extends CreateDomainError('organization_not_found', 404) {}

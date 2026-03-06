import { CreateDomainError } from '@/infra/ddd/error.js';

export class CategoryNotFoundError extends CreateDomainError('category_not_found') {}

import { CreateDomainError } from '@/infra/ddd/error.js';

export class ItemNotFoundError extends CreateDomainError('item_not_found', 404) {}

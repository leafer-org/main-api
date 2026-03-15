import { CreateDomainError } from '@/infra/ddd/error.js';

export class MediaAlreadyExistsError extends CreateDomainError('media_already_exists', 400) {}

export class MediaNotFoundError extends CreateDomainError('media_not_found', 404) {}

export class MediaAlreadyInUseError extends CreateDomainError('media_already_in_use', 400) {}

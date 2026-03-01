import { CreateDomainError } from '@/infra/ddd/error.js';

export class FileAlreadyExistsError extends CreateDomainError('file_already_exists', 400) {}

export class FileNotFoundError extends CreateDomainError('file_not_found', 404) {}

export class FileAlreadyInUseError extends CreateDomainError('file_already_in_use', 400) {}

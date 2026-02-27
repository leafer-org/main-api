import { CreateDomainError } from '@/infra/ddd/error.js';

export class FileAlreadyExistsError extends CreateDomainError('file_already_exists') {}

export class FileNotFoundError extends CreateDomainError('file_not_found') {}

export class FileAlreadyInUseError extends CreateDomainError('file_already_in_use') {}

import { CreateDomainError } from '@/infra/ddd/error.js';

export class MessageNotFoundError extends CreateDomainError('message_not_found', 404) {}

export class MessageDeletedError extends CreateDomainError('message_deleted', 400) {}

export class MessageAlreadyDeletedError extends CreateDomainError(
  'message_already_deleted',
  400,
) {}

export class EditWindowExpiredError extends CreateDomainError('edit_window_expired', 400) {}

export class DeleteWindowExpiredError extends CreateDomainError('delete_window_expired', 400) {}

export class NotMessageAuthorError extends CreateDomainError('not_message_author', 403) {}

export class CannotModifySystemMessageError extends CreateDomainError(
  'cannot_modify_system_message',
  400,
) {}

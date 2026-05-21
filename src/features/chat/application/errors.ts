import { CreateDomainError } from '@/infra/ddd/error.js';

export class OrganizationNotFoundForChatError extends CreateDomainError(
  'organization_not_found',
  404,
) {}

export class NotAChatResponderError extends CreateDomainError('not_a_chat_responder', 403) {}

export class QueryTooShortError extends CreateDomainError('query_too_short', 400) {}

export class InvalidCursorError extends CreateDomainError('invalid_cursor', 400) {}

export class NoChatAccessError extends CreateDomainError('no_chat_access', 403) {}

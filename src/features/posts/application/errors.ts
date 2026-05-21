import { CreateDomainError } from '@/infra/ddd/error.js';

export class OrganizationNotFoundForPostsError extends CreateDomainError(
  'organization_not_found',
  404,
) {}

export class CannotActAsOrganizationError extends CreateDomainError(
  'cannot_act_as_organization',
  403,
) {}

export class CannotEditPostError extends CreateDomainError('cannot_edit_post', 403) {}

export class CannotDeletePostError extends CreateDomainError('cannot_delete_post', 403) {}

export class CannotDeleteCommentError extends CreateDomainError('cannot_delete_comment', 403) {}

export class PostViewBatchTooLargeError extends CreateDomainError('batch_too_large', 400) {}

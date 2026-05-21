import { CreateDomainError } from '@/infra/ddd/error.js';

export class CommentNotFoundError extends CreateDomainError('comment_not_found', 404) {}

export class EmptyCommentError extends CreateDomainError('empty_comment', 400) {}

export class CommentTooLongError extends CreateDomainError('comment_too_long', 400) {}

export class CommentAlreadyHiddenError extends CreateDomainError('comment_already_hidden', 409) {}

export class CommentNotHiddenError extends CreateDomainError('comment_not_hidden', 409) {}

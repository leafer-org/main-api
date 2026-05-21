import { CreateDomainError } from '@/infra/ddd/error.js';

export class PostNotFoundError extends CreateDomainError('post_not_found', 404) {}

export class EmptyPostError extends CreateDomainError('empty_post', 400) {}

export class PostTextTooLongError extends CreateDomainError('post_text_too_long', 400) {}

export class PostTooManyMediaError extends CreateDomainError('post_too_many_media', 400) {}

export class PostAlreadyHiddenError extends CreateDomainError('post_already_hidden', 409) {}

export class PostNotHiddenError extends CreateDomainError('post_not_hidden', 409) {}

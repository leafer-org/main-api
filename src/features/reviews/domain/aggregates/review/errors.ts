import { CreateDomainError } from '@/infra/ddd/error.js';

export class ReviewAlreadyExistsError extends CreateDomainError('review_already_exists', 409) {}
export class ReviewNotFoundError extends CreateDomainError('review_not_found', 404) {}
export class ReviewNotPendingError extends CreateDomainError('review_not_pending', 400) {}
export class ReviewNotPublishedError extends CreateDomainError('review_not_published', 400) {}
export class ReviewAlreadyDisputedError extends CreateDomainError('review_already_disputed', 400) {}
export class ReviewNotDisputedError extends CreateDomainError('review_not_disputed', 400) {}
export class ReviewAlreadyRepliedError extends CreateDomainError('review_already_replied', 400) {}
export class CannotReviewOwnItemError extends CreateDomainError('cannot_review_own_item', 400) {}

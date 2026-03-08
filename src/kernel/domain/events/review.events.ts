import type { ItemId, OrganizationId } from '../ids.js';

export type ReviewTarget =
  | { targetType: 'item'; itemId: ItemId }
  | { targetType: 'organization'; organizationId: OrganizationId };

export type ReviewCreatedEvent = {
  id: string;
  type: 'review.created';
  reviewId: string;
  target: ReviewTarget;
  newRating: number | null;
  newReviewCount: number;
  createdAt: Date;
};

export type ReviewDeletedEvent = {
  id: string;
  type: 'review.deleted';
  reviewId: string;
  target: ReviewTarget;
  newRating: number | null;
  newReviewCount: number;
  deletedAt: Date;
};

export type ReviewIntegrationEvent = ReviewCreatedEvent | ReviewDeletedEvent;

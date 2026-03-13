import type { Rating } from '../../vo/rating.js';
import type { ReviewTarget } from '@/kernel/domain/events/review.events.js';

export type ReviewCreatedEvent = {
  type: 'review.created';
  status: 'pending' | 'published';
  rating: Rating;
  text: string | null;
  newRating: number | null;
  newReviewCount: number;
};

export type ReviewEditedEvent = {
  type: 'review.edited';
  rating: Rating;
  text: string | null;
  autoPublished: boolean;
  newRating: number | null;
  newReviewCount: number;
};

export type ReviewApprovedEvent = {
  type: 'review.approved';
  newRating: number | null;
  newReviewCount: number;
};

export type ReviewRejectedEvent = {
  type: 'review.rejected';
};

export type ReviewDeletedEvent = {
  type: 'review.deleted';
  newRating: number | null;
  newReviewCount: number;
};

export type ReviewRepliedEvent = {
  type: 'review.replied';
  replyText: string;
};

export type ReviewDisputedEvent = {
  type: 'review.disputed';
  reason: string;
  newRating: number | null;
  newReviewCount: number;
};

export type ReviewDisputeUpheldEvent = {
  type: 'review.dispute-upheld';
  newRating: number | null;
  newReviewCount: number;
};

export type ReviewDisputeRemovedEvent = {
  type: 'review.dispute-removed';
};

export type ReviewEvent =
  | ReviewCreatedEvent
  | ReviewEditedEvent
  | ReviewApprovedEvent
  | ReviewRejectedEvent
  | ReviewDeletedEvent
  | ReviewRepliedEvent
  | ReviewDisputedEvent
  | ReviewDisputeUpheldEvent
  | ReviewDisputeRemovedEvent;

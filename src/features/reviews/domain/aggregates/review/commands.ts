import type { OrganizationId, ReviewId, UserId } from '@/kernel/domain/ids.js';
import type { ReviewTarget } from '@/kernel/domain/events/review.events.js';
import type { Rating } from '../../vo/rating.js';

export type CreateReviewCommand = {
  type: 'CreateReview';
  reviewId: ReviewId;
  authorId: UserId;
  target: ReviewTarget;
  organizationId: OrganizationId;
  rating: Rating;
  text: string | null;
  now: Date;
  currentCount: number;
  currentSum: number;
};

export type EditReviewCommand = {
  type: 'EditReview';
  rating?: Rating;
  text?: string | null;
  now: Date;
  currentCount: number;
  currentSum: number;
};

export type ApproveReviewCommand = {
  type: 'ApproveReview';
  approvedBy: UserId;
  now: Date;
  currentCount: number;
  currentSum: number;
};

export type RejectReviewCommand = {
  type: 'RejectReview';
  rejectedBy: UserId;
  reason: string;
  now: Date;
};

export type DeleteReviewCommand = {
  type: 'DeleteReview';
  deletedBy: UserId;
  now: Date;
  currentCount: number;
  currentSum: number;
};

export type ReplyToReviewCommand = {
  type: 'ReplyToReview';
  repliedBy: UserId;
  replyText: string;
  now: Date;
};

export type DisputeReviewCommand = {
  type: 'DisputeReview';
  disputedBy: UserId;
  reason: string;
  now: Date;
  currentCount: number;
  currentSum: number;
};

export type ResolveDisputeCommand = {
  type: 'ResolveDispute';
  resolvedBy: UserId;
  resolution: 'uphold' | 'remove';
  now: Date;
  currentCount: number;
  currentSum: number;
};

export type ReviewCommand =
  | CreateReviewCommand
  | EditReviewCommand
  | ApproveReviewCommand
  | RejectReviewCommand
  | DeleteReviewCommand
  | ReplyToReviewCommand
  | DisputeReviewCommand
  | ResolveDisputeCommand;

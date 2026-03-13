import type { EntityState } from '@/infra/ddd/entity-state.js';
import type { OrganizationId, ReviewId, UserId } from '@/kernel/domain/ids.js';
import type { ReviewTarget } from '@/kernel/domain/events/review.events.js';
import type { Rating } from '../../vo/rating.js';

export type ReviewStatus = 'pending' | 'published' | 'disputed' | 'deleted';

export type ReviewState = EntityState<{
  reviewId: ReviewId;
  authorId: UserId;
  target: ReviewTarget;
  organizationId: OrganizationId;
  rating: Rating;
  text: string | null;
  status: ReviewStatus;
  replyText: string | null;
  repliedBy: UserId | null;
  repliedAt: Date | null;
  disputeReason: string | null;
  disputedBy: UserId | null;
  disputedAt: Date | null;
  wasDisputed: boolean;
  createdAt: Date;
  updatedAt: Date;
}>;

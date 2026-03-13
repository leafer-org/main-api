import type {
  ApproveReviewCommand,
  CreateReviewCommand,
  DeleteReviewCommand,
  DisputeReviewCommand,
  EditReviewCommand,
  ReplyToReviewCommand,
  RejectReviewCommand,
  ResolveDisputeCommand,
} from './commands.js';
import {
  ReviewAlreadyDisputedError,
  ReviewAlreadyRepliedError,
  ReviewNotDisputedError,
  ReviewNotFoundError,
  ReviewNotPendingError,
  ReviewNotPublishedError,
} from './errors.js';
import type {
  ReviewApprovedEvent,
  ReviewCreatedEvent,
  ReviewDeletedEvent,
  ReviewDisputeRemovedEvent,
  ReviewDisputeUpheldEvent,
  ReviewDisputedEvent,
  ReviewEditedEvent,
  ReviewRejectedEvent,
  ReviewRepliedEvent,
} from './events.js';
import type { ReviewState } from './state.js';
import { type Either, Left, Right } from '@/infra/lib/box.js';
import { Rating } from '../../vo/rating.js';

export type { ReviewState } from './state.js';

function computeNewStats(
  currentCount: number,
  currentSum: number,
  addedRating: number,
): { newRating: number | null; newReviewCount: number } {
  const newReviewCount = currentCount + 1;
  const newRating = (currentSum + addedRating) / newReviewCount;
  return { newRating, newReviewCount };
}

function computeRemovedStats(
  currentCount: number,
  currentSum: number,
  removedRating: number,
): { newRating: number | null; newReviewCount: number } {
  const newReviewCount = currentCount - 1;
  if (newReviewCount <= 0) return { newRating: null, newReviewCount: 0 };
  const newRating = (currentSum - removedRating) / newReviewCount;
  return { newRating, newReviewCount };
}

export const ReviewEntity = {
  create(
    state: ReviewState | null,
    cmd: CreateReviewCommand,
  ): Either<never, { state: ReviewState; event: ReviewCreatedEvent }> {
    const isAutoPublished = cmd.rating >= Rating.AUTO_PUBLISH_THRESHOLD;
    const status = isAutoPublished ? 'published' : 'pending';

    const stats = isAutoPublished
      ? computeNewStats(cmd.currentCount, cmd.currentSum, cmd.rating)
      : { newRating: null, newReviewCount: 0 };

    const event: ReviewCreatedEvent = {
      type: 'review.created',
      status,
      rating: cmd.rating,
      text: cmd.text,
      newRating: stats.newRating,
      newReviewCount: stats.newReviewCount,
    };

    const newState: ReviewState = {
      reviewId: cmd.reviewId,
      authorId: cmd.authorId,
      target: cmd.target,
      organizationId: cmd.organizationId,
      rating: cmd.rating,
      text: cmd.text,
      status,
      replyText: null,
      repliedBy: null,
      repliedAt: null,
      disputeReason: null,
      disputedBy: null,
      disputedAt: null,
      wasDisputed: false,
      createdAt: cmd.now,
      updatedAt: cmd.now,
    };

    return Right({ state: newState, event });
  },

  edit(
    state: ReviewState | null,
    cmd: EditReviewCommand,
  ): Either<
    ReviewNotFoundError | ReviewNotPendingError,
    { state: ReviewState; event: ReviewEditedEvent }
  > {
    if (!state) return Left(new ReviewNotFoundError());
    if (state.status !== 'pending') return Left(new ReviewNotPendingError());

    const newRating = cmd.rating ?? state.rating;
    const newText = cmd.text !== undefined ? cmd.text : state.text;
    const autoPublished = newRating >= Rating.AUTO_PUBLISH_THRESHOLD;
    const newStatus = autoPublished ? 'published' : 'pending';

    const stats = autoPublished
      ? computeNewStats(cmd.currentCount, cmd.currentSum, newRating)
      : { newRating: null, newReviewCount: 0 };

    const event: ReviewEditedEvent = {
      type: 'review.edited',
      rating: newRating,
      text: newText,
      autoPublished,
      newRating: stats.newRating,
      newReviewCount: stats.newReviewCount,
    };

    return Right({
      state: {
        ...state,
        rating: newRating,
        text: newText,
        status: newStatus,
        updatedAt: cmd.now,
      },
      event,
    });
  },

  approve(
    state: ReviewState | null,
    cmd: ApproveReviewCommand,
  ): Either<
    ReviewNotFoundError | ReviewNotPendingError,
    { state: ReviewState; event: ReviewApprovedEvent }
  > {
    if (!state) return Left(new ReviewNotFoundError());
    if (state.status !== 'pending') return Left(new ReviewNotPendingError());

    const stats = computeNewStats(cmd.currentCount, cmd.currentSum, state.rating);

    const event: ReviewApprovedEvent = {
      type: 'review.approved',
      newRating: stats.newRating,
      newReviewCount: stats.newReviewCount,
    };

    return Right({
      state: { ...state, status: 'published', updatedAt: cmd.now },
      event,
    });
  },

  reject(
    state: ReviewState | null,
    cmd: RejectReviewCommand,
  ): Either<
    ReviewNotFoundError | ReviewNotPendingError,
    { state: ReviewState; event: ReviewRejectedEvent }
  > {
    if (!state) return Left(new ReviewNotFoundError());
    if (state.status !== 'pending') return Left(new ReviewNotPendingError());

    return Right({
      state: { ...state, status: 'deleted', updatedAt: cmd.now },
      event: { type: 'review.rejected' },
    });
  },

  delete(
    state: ReviewState | null,
    cmd: DeleteReviewCommand,
  ): Either<
    ReviewNotFoundError | ReviewNotPublishedError,
    { state: ReviewState; event: ReviewDeletedEvent }
  > {
    if (!state) return Left(new ReviewNotFoundError());
    if (state.status !== 'published') return Left(new ReviewNotPublishedError());

    const stats = computeRemovedStats(cmd.currentCount, cmd.currentSum, state.rating);

    return Right({
      state: { ...state, status: 'deleted', updatedAt: cmd.now },
      event: { type: 'review.deleted', ...stats },
    });
  },

  reply(
    state: ReviewState | null,
    cmd: ReplyToReviewCommand,
  ): Either<
    ReviewNotFoundError | ReviewNotPublishedError | ReviewAlreadyRepliedError,
    { state: ReviewState; event: ReviewRepliedEvent }
  > {
    if (!state) return Left(new ReviewNotFoundError());
    if (state.status !== 'published') return Left(new ReviewNotPublishedError());
    if (state.replyText !== null) return Left(new ReviewAlreadyRepliedError());

    return Right({
      state: {
        ...state,
        replyText: cmd.replyText,
        repliedBy: cmd.repliedBy,
        repliedAt: cmd.now,
        updatedAt: cmd.now,
      },
      event: { type: 'review.replied', replyText: cmd.replyText },
    });
  },

  dispute(
    state: ReviewState | null,
    cmd: DisputeReviewCommand,
  ): Either<
    ReviewNotFoundError | ReviewNotPublishedError | ReviewAlreadyDisputedError,
    { state: ReviewState; event: ReviewDisputedEvent }
  > {
    if (!state) return Left(new ReviewNotFoundError());
    if (state.status !== 'published') return Left(new ReviewNotPublishedError());
    if (state.wasDisputed) return Left(new ReviewAlreadyDisputedError());

    const stats = computeRemovedStats(cmd.currentCount, cmd.currentSum, state.rating);

    return Right({
      state: {
        ...state,
        status: 'disputed',
        disputeReason: cmd.reason,
        disputedBy: cmd.disputedBy,
        disputedAt: cmd.now,
        wasDisputed: true,
        updatedAt: cmd.now,
      },
      event: { type: 'review.disputed', reason: cmd.reason, ...stats },
    });
  },

  resolveDispute(
    state: ReviewState | null,
    cmd: ResolveDisputeCommand,
  ): Either<
    ReviewNotFoundError | ReviewNotDisputedError,
    { state: ReviewState; event: ReviewDisputeUpheldEvent | ReviewDisputeRemovedEvent }
  > {
    if (!state) return Left(new ReviewNotFoundError());
    if (state.status !== 'disputed') return Left(new ReviewNotDisputedError());

    if (cmd.resolution === 'uphold') {
      const stats = computeNewStats(cmd.currentCount, cmd.currentSum, state.rating);

      return Right({
        state: { ...state, status: 'published', updatedAt: cmd.now },
        event: { type: 'review.dispute-upheld', ...stats },
      });
    }

    return Right({
      state: { ...state, status: 'deleted', updatedAt: cmd.now },
      event: { type: 'review.dispute-removed' },
    });
  },
};

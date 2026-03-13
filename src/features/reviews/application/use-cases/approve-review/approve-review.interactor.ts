import { Inject, Injectable } from '@nestjs/common';

import { ReviewEntity } from '../../../domain/aggregates/review/entity.js';
import { ReviewNotFoundError } from '../../../domain/aggregates/review/errors.js';
import { ReviewEventPublisher, ReviewQueryPort, ReviewRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { ReviewId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class ApproveReviewInteractor {
  public constructor(
    @Inject(ReviewRepository) private readonly reviewRepository: ReviewRepository,
    @Inject(ReviewQueryPort) private readonly reviewQuery: ReviewQueryPort,
    @Inject(ReviewEventPublisher) private readonly eventPublisher: ReviewEventPublisher,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async execute(command: { reviewId: ReviewId; approvedBy: UserId }) {
    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.reviewRepository.findById(tx, command.reviewId);
      if (!state) return Left(new ReviewNotFoundError());

      const stats = await this.reviewQuery.getTargetStats(tx, state.target);

      const result = ReviewEntity.approve(state, {
        type: 'ApproveReview',
        approvedBy: command.approvedBy,
        now,
        currentCount: stats.count,
        currentSum: stats.sum,
      });

      if (isLeft(result)) return result;

      const { state: newState, event } = result.value;
      await this.reviewRepository.save(tx, newState);

      await this.eventPublisher.publishReviewCreated(tx, {
        id: crypto.randomUUID(),
        type: 'review.created',
        reviewId: newState.reviewId as string,
        userId: state.authorId,
        target: newState.target,
        newRating: event.newRating,
        newReviewCount: event.newReviewCount,
        createdAt: now,
      });

      return Right(newState);
    });
  }
}

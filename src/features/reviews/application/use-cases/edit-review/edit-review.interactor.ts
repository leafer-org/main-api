import { Inject, Injectable } from '@nestjs/common';

import { ReviewEntity } from '../../../domain/aggregates/review/entity.js';
import { Rating } from '../../../domain/vo/rating.js';
import { ReviewEventPublisher, ReviewQueryPort, ReviewRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { ReviewId } from '@/kernel/domain/ids.js';
import { ReviewNotFoundError } from '../../../domain/aggregates/review/errors.js';

@Injectable()
export class EditReviewInteractor {
  public constructor(
    @Inject(ReviewRepository) private readonly reviewRepository: ReviewRepository,
    @Inject(ReviewQueryPort) private readonly reviewQuery: ReviewQueryPort,
    @Inject(ReviewEventPublisher) private readonly eventPublisher: ReviewEventPublisher,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async execute(command: {
    reviewId: ReviewId;
    rating?: number;
    text?: string | null;
  }) {
    const rating = command.rating !== undefined ? Rating.create(command.rating) : undefined;
    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.reviewRepository.findById(tx, command.reviewId);
      if (!state) return Left(new ReviewNotFoundError());

      const stats = await this.reviewQuery.getTargetStats(tx, state.target);

      const result = ReviewEntity.edit(state, {
        type: 'EditReview',
        rating,
        text: command.text,
        now,
        currentCount: stats.count,
        currentSum: stats.sum,
      });

      if (isLeft(result)) return result;

      const { state: newState, event } = result.value;
      await this.reviewRepository.save(tx, newState);

      if (event.autoPublished) {
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
      }

      return Right(newState);
    });
  }
}

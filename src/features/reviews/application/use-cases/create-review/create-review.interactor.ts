import { Inject, Injectable } from '@nestjs/common';

import { ReviewEntity } from '../../../domain/aggregates/review/entity.js';
import { ReviewAlreadyExistsError, CannotReviewOwnItemError } from '../../../domain/aggregates/review/errors.js';
import { Rating } from '../../../domain/vo/rating.js';
import { ReviewEventPublisher, ReviewQueryPort, ReviewRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { OrganizationId, ReviewId, UserId } from '@/kernel/domain/ids.js';
import type { ReviewTarget } from '@/kernel/domain/events/review.events.js';

@Injectable()
export class CreateReviewInteractor {
  public constructor(
    @Inject(ReviewRepository) private readonly reviewRepository: ReviewRepository,
    @Inject(ReviewQueryPort) private readonly reviewQuery: ReviewQueryPort,
    @Inject(ReviewEventPublisher) private readonly eventPublisher: ReviewEventPublisher,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async execute(command: {
    reviewId: ReviewId;
    authorId: UserId;
    target: ReviewTarget;
    organizationId: OrganizationId;
    rating: number;
    text: string | null;
  }) {
    const rating = Rating.create(command.rating);
    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const existing = await this.reviewQuery.findByAuthorAndTarget(
        tx,
        command.authorId,
        command.target,
      );
      if (existing) return Left(new ReviewAlreadyExistsError());

      const stats = await this.reviewQuery.getTargetStats(tx, command.target);

      const result = ReviewEntity.create(null, {
        type: 'CreateReview',
        reviewId: command.reviewId,
        authorId: command.authorId,
        target: command.target,
        organizationId: command.organizationId,
        rating,
        text: command.text,
        now,
        currentCount: stats.count,
        currentSum: stats.sum,
      });

      if (isLeft(result)) return result;

      const { state, event } = result.value;
      await this.reviewRepository.save(tx, state);

      if (event.status === 'published') {
        await this.eventPublisher.publishReviewCreated(tx, {
          id: crypto.randomUUID(),
          type: 'review.created',
          reviewId: state.reviewId as string,
          userId: command.authorId,
          target: state.target,
          newRating: event.newRating,
          newReviewCount: event.newReviewCount,
          createdAt: now,
        });
      }

      return Right(state);
    });
  }
}

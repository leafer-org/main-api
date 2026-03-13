import { Inject, Injectable } from '@nestjs/common';

import { ReviewEntity } from '../../../domain/aggregates/review/entity.js';
import { ReviewNotFoundError } from '../../../domain/aggregates/review/errors.js';
import { ReviewRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { ReviewId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class ReplyToReviewInteractor {
  public constructor(
    @Inject(ReviewRepository) private readonly reviewRepository: ReviewRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async execute(command: { reviewId: ReviewId; repliedBy: UserId; replyText: string }) {
    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.reviewRepository.findById(tx, command.reviewId);
      if (!state) return Left(new ReviewNotFoundError());

      const result = ReviewEntity.reply(state, {
        type: 'ReplyToReview',
        repliedBy: command.repliedBy,
        replyText: command.replyText,
        now,
      });

      if (isLeft(result)) return result;

      await this.reviewRepository.save(tx, result.value.state);

      return Right(result.value.state);
    });
  }
}

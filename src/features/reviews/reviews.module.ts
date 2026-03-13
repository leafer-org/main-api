import { Module } from '@nestjs/common';

import { ReviewQueryPort, ReviewEventPublisher, ReviewRepository } from './application/ports.js';
import { CreateReviewInteractor } from './application/use-cases/create-review/create-review.interactor.js';
import { EditReviewInteractor } from './application/use-cases/edit-review/edit-review.interactor.js';
import { ApproveReviewInteractor } from './application/use-cases/approve-review/approve-review.interactor.js';
import { RejectReviewInteractor } from './application/use-cases/reject-review/reject-review.interactor.js';
import { DeleteReviewInteractor } from './application/use-cases/delete-review/delete-review.interactor.js';
import { ReplyToReviewInteractor } from './application/use-cases/reply-to-review/reply-to-review.interactor.js';
import { DisputeReviewInteractor } from './application/use-cases/dispute-review/dispute-review.interactor.js';
import { ResolveDisputeInteractor } from './application/use-cases/resolve-dispute/resolve-dispute.interactor.js';
import { ReviewDatabaseClient } from './adapters/db/client.js';
import { DrizzleReviewRepository } from './adapters/db/repositories/review.repository.js';
import { DrizzleReviewQuery } from './adapters/db/queries/review.query.js';
import { ReviewController } from './adapters/http/review.controller.js';
import { ReviewModerationController } from './adapters/http/review-moderation.controller.js';
import { OutboxReviewEventPublisher } from './adapters/kafka/review-event.publisher.js';
import { Clock, SystemClock } from '@/infra/lib/clock.js';

@Module({
  controllers: [ReviewController, ReviewModerationController],
  providers: [
    { provide: Clock, useClass: SystemClock },

    // Port → Adapter
    { provide: ReviewRepository, useClass: DrizzleReviewRepository },
    { provide: ReviewQueryPort, useClass: DrizzleReviewQuery },
    { provide: ReviewEventPublisher, useClass: OutboxReviewEventPublisher },

    // Use cases
    CreateReviewInteractor,
    EditReviewInteractor,
    ApproveReviewInteractor,
    RejectReviewInteractor,
    DeleteReviewInteractor,
    ReplyToReviewInteractor,
    DisputeReviewInteractor,
    ResolveDisputeInteractor,
  ],
})
export class ReviewsModule {}

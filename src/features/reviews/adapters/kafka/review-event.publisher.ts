import { Inject, Injectable } from '@nestjs/common';

import { ReviewEventPublisher } from '../../application/ports.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { reviewStreamingContract } from '@/infra/kafka-contracts/review.contract.js';
import { OutboxService } from '@/infra/lib/nest-outbox/outbox.service.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { ReviewCreatedEvent, ReviewDeletedEvent } from '@/kernel/domain/events/review.events.js';

function serializeTarget(target: ReviewCreatedEvent['target']) {
  return {
    targetType: target.targetType,
    itemId: target.targetType === 'item' ? (target.itemId as string) : undefined,
    organizationId:
      target.targetType === 'organization' ? (target.organizationId as string) : undefined,
  };
}

@Injectable()
export class OutboxReviewEventPublisher extends ReviewEventPublisher {
  public constructor(
    private readonly txHost: TransactionHostPg,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {
    super();
  }

  public async publishReviewCreated(tx: Transaction, event: ReviewCreatedEvent): Promise<void> {
    const db = this.txHost.get(tx);
    await this.outbox.enqueue(
      db,
      reviewStreamingContract,
      {
        id: event.id,
        type: 'review.created',
        reviewId: event.reviewId,
        userId: event.userId as string,
        target: serializeTarget(event.target),
        newRating: event.newRating,
        newReviewCount: event.newReviewCount,
        createdAt: event.createdAt.toISOString(),
      },
      { key: event.reviewId },
    );
  }

  public async publishReviewDeleted(tx: Transaction, event: ReviewDeletedEvent): Promise<void> {
    const db = this.txHost.get(tx);
    await this.outbox.enqueue(
      db,
      reviewStreamingContract,
      {
        id: event.id,
        type: 'review.deleted',
        reviewId: event.reviewId,
        target: serializeTarget(event.target),
        newRating: event.newRating,
        newReviewCount: event.newReviewCount,
        deletedAt: event.deletedAt.toISOString(),
      },
      { key: event.reviewId },
    );
  }
}

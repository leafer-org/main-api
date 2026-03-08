import { Inject, Injectable } from '@nestjs/common';

import {
  IdempotencyPort,
  ItemProjectionPort,
  OwnerProjectionPort,
} from '../../projection-ports.js';
import type {
  ReviewCreatedEvent,
  ReviewDeletedEvent,
} from '@/kernel/domain/events/review.events.js';

/**
 * review.created / review.deleted → обновляет itemReview или ownerReview
 * (+ OwnerReadModel) в зависимости от ReviewTarget. Рейтинг pre-computed в событии.
 */
@Injectable()
export class ProjectReviewHandler {
  public constructor(
    @Inject(IdempotencyPort) private readonly idempotency: IdempotencyPort,
    @Inject(ItemProjectionPort) private readonly itemProjection: ItemProjectionPort,
    @Inject(OwnerProjectionPort) private readonly ownerProjection: OwnerProjectionPort,
  ) {}

  public async handleReviewCreated(eventId: string, payload: ReviewCreatedEvent): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    await this.applyReview(payload.target, payload.newRating, payload.newReviewCount);
    await this.idempotency.markProcessed(eventId);
  }

  public async handleReviewDeleted(eventId: string, payload: ReviewDeletedEvent): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    await this.applyReview(payload.target, payload.newRating, payload.newReviewCount);
    await this.idempotency.markProcessed(eventId);
  }

  private async applyReview(
    target: ReviewCreatedEvent['target'],
    newRating: number | null,
    newReviewCount: number,
  ): Promise<void> {
    if (target.targetType === 'item') {
      await this.itemProjection.updateItemReview(target.itemId, newRating, newReviewCount);
    } else {
      await this.itemProjection.updateOwnerReview(target.organizationId, newRating, newReviewCount);
      await this.ownerProjection.updateReview(target.organizationId, newRating, newReviewCount);
    }
  }
}

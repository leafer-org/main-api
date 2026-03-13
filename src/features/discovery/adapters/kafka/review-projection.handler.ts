import { Injectable } from '@nestjs/common';

import { ProjectReviewHandler } from '../../application/use-cases/project-review/project-review.handler.js';
import { DISCOVERY_CONSUMER_ID } from './consumer-ids.js';
import { reviewStreamingContract } from '@/infra/kafka-contracts/review.contract.js';
import {
  ContractHandler,
  type ContractKafkaMessage,
  KafkaConsumerHandlers,
} from '@/infra/lib/nest-kafka/index.js';
import type {
  ReviewCreatedEvent,
  ReviewDeletedEvent,
  ReviewTarget,
} from '@/kernel/domain/events/review.events.js';
import { ItemId, OrganizationId, UserId } from '@/kernel/domain/ids.js';

@KafkaConsumerHandlers(DISCOVERY_CONSUMER_ID)
@Injectable()
export class ReviewProjectionKafkaHandler {
  public constructor(private readonly handler: ProjectReviewHandler) {}

  @ContractHandler(reviewStreamingContract)
  public async handle(
    message: ContractKafkaMessage<typeof reviewStreamingContract>,
  ): Promise<void> {
    const payload = message.value;
    const target = this.mapTarget(payload.target);

    if (payload.type === 'review.created') {
      await this.handler.handleReviewCreated(payload.id, {
        id: payload.id,
        type: 'review.created',
        reviewId: payload.reviewId,
        userId: UserId.raw(payload.userId!),
        target,
        newRating: payload.newRating,
        newReviewCount: payload.newReviewCount,
        createdAt: new Date(payload.createdAt!),
      } satisfies ReviewCreatedEvent);
    } else if (payload.type === 'review.deleted') {
      await this.handler.handleReviewDeleted(payload.id, {
        id: payload.id,
        type: 'review.deleted',
        reviewId: payload.reviewId,
        target,
        newRating: payload.newRating,
        newReviewCount: payload.newReviewCount,
        deletedAt: new Date(payload.deletedAt!),
      } satisfies ReviewDeletedEvent);
    }
  }

  private mapTarget(target: {
    targetType: 'item' | 'organization';
    itemId?: string;
    organizationId?: string;
  }): ReviewTarget {
    if (target.targetType === 'item') {
      return { targetType: 'item', itemId: ItemId.raw(target.itemId!) };
    }
    return {
      targetType: 'organization',
      organizationId: OrganizationId.raw(target.organizationId!),
    };
  }
}

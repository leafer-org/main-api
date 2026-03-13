import { Injectable } from '@nestjs/common';

import { ConsumeReviewHandler } from '../../application/use-cases/consume-review/consume-review.handler.js';
import { INTERACTIONS_CONSUMER_ID } from './consumer-ids.js';
import { reviewStreamingContract } from '@/infra/kafka-contracts/review.contract.js';
import {
  ContractHandler,
  type ContractKafkaMessage,
  KafkaConsumerHandlers,
} from '@/infra/lib/nest-kafka/index.js';
import { ItemId, UserId } from '@/kernel/domain/ids.js';

@KafkaConsumerHandlers(INTERACTIONS_CONSUMER_ID)
@Injectable()
export class ReviewConsumerKafkaHandler {
  public constructor(private readonly handler: ConsumeReviewHandler) {}

  @ContractHandler(reviewStreamingContract)
  public async handle(
    message: ContractKafkaMessage<typeof reviewStreamingContract>,
  ): Promise<void> {
    const payload = message.value;

    if (payload.type !== 'review.created') return;
    if (payload.target.targetType !== 'item') return;
    if (!payload.userId || !payload.target.itemId) return;

    await this.handler.handleReviewCreated({
      userId: UserId.raw(payload.userId),
      itemId: ItemId.raw(payload.target.itemId),
      timestamp: new Date(payload.createdAt!),
    });
  }
}

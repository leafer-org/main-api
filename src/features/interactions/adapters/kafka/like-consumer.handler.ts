import { Injectable } from '@nestjs/common';

import { ConsumeLikeHandler } from '../../application/use-cases/consume-like/consume-like.handler.js';
import { INTERACTIONS_CONSUMER_ID } from './consumer-ids.js';
import { likeStreamingContract } from '@/infra/kafka-contracts/like.contract.js';
import {
  ContractHandler,
  type ContractKafkaMessage,
  KafkaConsumerHandlers,
} from '@/infra/lib/nest-kafka/index.js';
import { ItemId, UserId } from '@/kernel/domain/ids.js';

@KafkaConsumerHandlers(INTERACTIONS_CONSUMER_ID)
@Injectable()
export class LikeConsumerKafkaHandler {
  public constructor(private readonly handler: ConsumeLikeHandler) {}

  @ContractHandler(likeStreamingContract)
  public async handle(
    message: ContractKafkaMessage<typeof likeStreamingContract>,
  ): Promise<void> {
    const payload = message.value;

    if (payload.type === 'item.liked') {
      await this.handler.handleLiked({
        userId: UserId.raw(payload.userId),
        itemId: ItemId.raw(payload.itemId),
        timestamp: new Date(payload.timestamp),
      });
    } else if (payload.type === 'item.unliked') {
      await this.handler.handleUnliked({
        userId: UserId.raw(payload.userId),
        itemId: ItemId.raw(payload.itemId),
        timestamp: new Date(payload.timestamp),
      });
    }
  }
}

import { Injectable } from '@nestjs/common';

import { ProjectLikeHandler } from '../../application/use-cases/project-like/project-like.handler.js';
import { DISCOVERY_CONSUMER_ID } from './consumer-ids.js';
import { likeStreamingContract } from '@/infra/kafka-contracts/like.contract.js';
import {
  ContractHandler,
  type ContractKafkaMessage,
  KafkaConsumerHandlers,
} from '@/infra/lib/nest-kafka/index.js';
import type { ItemLikedEvent, ItemUnlikedEvent } from '@/kernel/domain/events/like.events.js';
import { ItemId, UserId } from '@/kernel/domain/ids.js';

@KafkaConsumerHandlers(DISCOVERY_CONSUMER_ID)
@Injectable()
export class LikeProjectionKafkaHandler {
  public constructor(private readonly handler: ProjectLikeHandler) {}

  @ContractHandler(likeStreamingContract)
  public async handle(
    message: ContractKafkaMessage<typeof likeStreamingContract>,
  ): Promise<void> {
    const payload = message.value;

    if (payload.type === 'item.liked') {
      await this.handler.handleItemLiked(payload.id, {
        id: payload.id,
        type: 'item.liked',
        userId: UserId.raw(payload.userId),
        itemId: ItemId.raw(payload.itemId),
        timestamp: new Date(payload.timestamp),
      } satisfies ItemLikedEvent);
    } else if (payload.type === 'item.unliked') {
      await this.handler.handleItemUnliked(payload.id, {
        id: payload.id,
        type: 'item.unliked',
        userId: UserId.raw(payload.userId),
        itemId: ItemId.raw(payload.itemId),
        timestamp: new Date(payload.timestamp),
      } satisfies ItemUnlikedEvent);
    }
  }
}

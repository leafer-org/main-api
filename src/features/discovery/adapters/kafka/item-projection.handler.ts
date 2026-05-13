import { Injectable } from '@nestjs/common';

import { ProjectItemHandler } from '../../application/use-cases/project-item/project-item.handler.js';
import { DISCOVERY_CONSUMER_ID } from './consumer-ids.js';
import { itemStreamingContract } from '@/infra/kafka-contracts/item.contract.js';
import {
  ContractHandler,
  type ContractKafkaMessage,
  KafkaConsumerHandlers,
} from '@/infra/lib/nest-kafka/index.js';
import { ItemId } from '@/kernel/domain/ids.js';

@KafkaConsumerHandlers(DISCOVERY_CONSUMER_ID)
@Injectable()
export class ItemProjectionKafkaHandler {
  public constructor(private readonly handler: ProjectItemHandler) {}

  @ContractHandler(itemStreamingContract)
  public async handle(message: ContractKafkaMessage<typeof itemStreamingContract>): Promise<void> {
    const payload = message.value;
    await this.handler.handleItemChanged(payload.id, ItemId.raw(payload.itemId));
  }
}

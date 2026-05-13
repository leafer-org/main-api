import { Injectable } from '@nestjs/common';

import { ProjectItemTypeHandler } from '../../application/use-cases/project-item-type/project-item-type.handler.js';
import { DISCOVERY_CONSUMER_ID } from './consumer-ids.js';
import { itemTypeStreamingContract } from '@/infra/kafka-contracts/item-type.contract.js';
import {
  ContractHandler,
  type ContractKafkaMessage,
  KafkaConsumerHandlers,
} from '@/infra/lib/nest-kafka/index.js';
import { TypeId } from '@/kernel/domain/ids.js';

@KafkaConsumerHandlers(DISCOVERY_CONSUMER_ID)
@Injectable()
export class ItemTypeProjectionKafkaHandler {
  public constructor(private readonly handler: ProjectItemTypeHandler) {}

  @ContractHandler(itemTypeStreamingContract)
  public async handle(
    message: ContractKafkaMessage<typeof itemTypeStreamingContract>,
  ): Promise<void> {
    const payload = message.value;
    await this.handler.handleItemTypeChanged(payload.id, TypeId.raw(payload.typeId));
  }
}

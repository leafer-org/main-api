import { Injectable } from '@nestjs/common';

import { OnUserEventHandler } from '../../application/handlers/on-user-event.handler.js';
import { IDP_CONSUMER_ID } from './consumer-ids.js';
import { userStreamingContract } from './topics.js';
import {
  BatchContractHandler,
  type ContractKafkaMessage,
  KafkaConsumerHandlers,
} from '@/infra/lib/nest-kafka/index.js';

@KafkaConsumerHandlers(IDP_CONSUMER_ID)
@Injectable()
export class UserEventsProjectionHandler {
  public constructor(private readonly handler: OnUserEventHandler) {}

  @BatchContractHandler(userStreamingContract)
  public async handleBatch(
    messages: ContractKafkaMessage<typeof userStreamingContract>[],
  ): Promise<void> {
    await this.handler.handleBatch(messages.map((m) => m.value));
  }
}

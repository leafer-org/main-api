import { Injectable } from '@nestjs/common';

import { ProjectInteractionHandler } from '../../application/use-cases/project-interaction/project-interaction.handler.js';
import { DISCOVERY_CONSUMER_ID } from './consumer-ids.js';
import { interactionStreamingContract } from '@/infra/kafka-contracts/interaction.contract.js';
import {
  ContractHandler,
  type ContractKafkaMessage,
  KafkaConsumerHandlers,
} from '@/infra/lib/nest-kafka/index.js';
import type { InteractionRecordedEvent } from '@/kernel/domain/events/interaction.events.js';
import { ItemId, UserId } from '@/kernel/domain/ids.js';

@KafkaConsumerHandlers(DISCOVERY_CONSUMER_ID)
@Injectable()
export class InteractionProjectionKafkaHandler {
  public constructor(private readonly handler: ProjectInteractionHandler) {}

  @ContractHandler(interactionStreamingContract)
  public async handle(
    message: ContractKafkaMessage<typeof interactionStreamingContract>,
  ): Promise<void> {
    const payload = message.value;

    await this.handler.handleInteractionRecorded(payload.id, {
      id: payload.id,
      type: 'interaction.recorded',
      userId: UserId.raw(payload.userId),
      itemId: ItemId.raw(payload.itemId),
      interactionType: payload.interactionType,
      timestamp: new Date(payload.timestamp),
    } satisfies InteractionRecordedEvent);
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';

import { InteractionPublisherPort } from '../../application/ports.js';
import { interactionStreamingContract } from '@/infra/kafka-contracts/interaction.contract.js';
import { KafkaProducerService } from '@/infra/lib/nest-kafka/producer/kafka-producer.service.js';
import type { InteractionType } from '@/kernel/domain/events/interaction.events.js';
import type { ItemId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class KafkaInteractionPublisher implements InteractionPublisherPort {
  private readonly logger = new Logger(KafkaInteractionPublisher.name);

  public constructor(
    @Inject(KafkaProducerService) private readonly producer: KafkaProducerService,
  ) {}

  public publish(params: {
    id: string;
    userId: UserId;
    itemId: ItemId;
    interactionType: InteractionType;
    metadata?: Record<string, unknown>;
    timestamp: Date;
  }): void {
    try {
      this.producer.send(
        interactionStreamingContract,
        {
          id: params.id,
          type: 'interaction.recorded',
          userId: params.userId as string,
          itemId: params.itemId as string,
          interactionType: params.interactionType,
          metadata: params.metadata,
          timestamp: params.timestamp.toISOString(),
        },
        { key: params.userId as string },
      );
    } catch (error) {
      this.logger.warn(`Failed to publish interaction ${params.id}`, error);
    }
  }

  public publishBatch(
    messages: {
      id: string;
      userId: UserId;
      itemId: ItemId;
      interactionType: InteractionType;
      timestamp: Date;
    }[],
  ): void {
    if (messages.length === 0) return;

    try {
      this.producer.sendBatch(
        interactionStreamingContract,
        messages.map((m) => ({
          value: {
            id: m.id,
            type: 'interaction.recorded' as const,
            userId: m.userId as string,
            itemId: m.itemId as string,
            interactionType: m.interactionType,
            timestamp: m.timestamp.toISOString(),
          },
          key: m.userId as string,
        })),
      );
    } catch (error) {
      this.logger.warn(`Failed to publish interaction batch (${messages.length} items)`, error);
    }
  }
}

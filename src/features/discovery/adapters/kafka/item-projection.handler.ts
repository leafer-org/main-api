import { Injectable } from '@nestjs/common';

import { ProjectItemHandler } from '../../application/use-cases/project-item/project-item.handler.js';
import { DISCOVERY_CONSUMER_ID } from './consumer-ids.js';
import { itemStreamingContract } from '@/infra/kafka-contracts/item.contract.js';
import {
  ContractHandler,
  type ContractKafkaMessage,
  KafkaConsumerHandlers,
} from '@/infra/lib/nest-kafka/index.js';
import type {
  ItemPublishedEvent,
  ItemUnpublishedEvent,
  ItemWidget,
} from '@/kernel/domain/events/item.events.js';
import { ItemId, OrganizationId, TypeId } from '@/kernel/domain/ids.js';

@KafkaConsumerHandlers(DISCOVERY_CONSUMER_ID)
@Injectable()
export class ItemProjectionKafkaHandler {
  public constructor(private readonly handler: ProjectItemHandler) {}

  @ContractHandler(itemStreamingContract)
  public async handle(message: ContractKafkaMessage<typeof itemStreamingContract>): Promise<void> {
    const payload = message.value;

    if (payload.type === 'item.published') {
      await this.handler.handleItemPublished(payload.id, {
        id: payload.id,
        type: 'item.published',
        itemId: ItemId.raw(payload.itemId),
        typeId: TypeId.raw(payload.typeId!),
        organizationId: OrganizationId.raw(payload.organizationId!),
        widgets: (payload.widgets ?? []) as ItemWidget[],
        republished: payload.republished ?? false,
        publishedAt: new Date(payload.publishedAt!),
      } satisfies ItemPublishedEvent);
    } else if (payload.type === 'item.unpublished') {
      await this.handler.handleItemUnpublished(payload.id, {
        id: payload.id,
        type: 'item.unpublished',
        itemId: ItemId.raw(payload.itemId),
        unpublishedAt: new Date(payload.unpublishedAt!),
      } satisfies ItemUnpublishedEvent);
    }
  }
}

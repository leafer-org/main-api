import { Injectable } from '@nestjs/common';

import { ProjectItemTypeHandler } from '../../application/use-cases/project-item-type/project-item-type.handler.js';
import { DISCOVERY_CONSUMER_ID } from './consumer-ids.js';
import { itemTypeStreamingContract } from '@/infra/kafka-contracts/item-type.contract.js';
import {
  ContractHandler,
  type ContractKafkaMessage,
  KafkaConsumerHandlers,
} from '@/infra/lib/nest-kafka/index.js';
import type {
  ItemTypeCreatedEvent,
  ItemTypeUpdatedEvent,
} from '@/kernel/domain/events/item-type.events.js';
import { TypeId } from '@/kernel/domain/ids.js';
import type { WidgetType } from '@/kernel/domain/vo/widget.js';

@KafkaConsumerHandlers(DISCOVERY_CONSUMER_ID)
@Injectable()
export class ItemTypeProjectionKafkaHandler {
  public constructor(private readonly handler: ProjectItemTypeHandler) {}

  @ContractHandler(itemTypeStreamingContract)
  public async handle(
    message: ContractKafkaMessage<typeof itemTypeStreamingContract>,
  ): Promise<void> {
    const payload = message.value;

    if (payload.type === 'item-type.created') {
      await this.handler.handleItemTypeCreated(payload.id, {
        id: payload.id,
        type: 'item-type.created',
        typeId: TypeId.raw(payload.typeId),
        name: payload.name!,
        availableWidgetTypes: (payload.availableWidgetTypes ?? []) as WidgetType[],
        requiredWidgetTypes: (payload.requiredWidgetTypes ?? []) as WidgetType[],
        createdAt: new Date(payload.createdAt!),
      } satisfies ItemTypeCreatedEvent);
    } else if (payload.type === 'item-type.updated') {
      await this.handler.handleItemTypeUpdated(payload.id, {
        id: payload.id,
        type: 'item-type.updated',
        typeId: TypeId.raw(payload.typeId),
        name: payload.name!,
        availableWidgetTypes: (payload.availableWidgetTypes ?? []) as WidgetType[],
        requiredWidgetTypes: (payload.requiredWidgetTypes ?? []) as WidgetType[],
        updatedAt: new Date(payload.updatedAt!),
      } satisfies ItemTypeUpdatedEvent);
    }
  }
}

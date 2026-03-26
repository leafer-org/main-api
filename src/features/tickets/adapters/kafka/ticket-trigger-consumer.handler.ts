import { Injectable } from '@nestjs/common';

import { HandleCloseTriggerInteractor } from '../../application/use-cases/tickets/handle-close-trigger.interactor.js';
import { HandleTriggerEventInteractor } from '../../application/use-cases/tickets/handle-trigger-event.interactor.js';
import type { TriggerEvent } from '../../domain/events/trigger-events.js';
import type { CloseEvent } from '../../domain/events/close-events.js';
import { TICKETS_CONSUMER_ID } from './consumer-ids.js';
import { itemModerationContract } from '@/infra/kafka-contracts/item-moderation.contract.js';
import { moderationResultsContract } from '@/infra/kafka-contracts/moderation-results.contract.js';
import { organizationModerationContract } from '@/infra/kafka-contracts/organization-moderation.contract.js';
import {
  ContractHandler,
  type ContractKafkaMessage,
  KafkaConsumerHandlers,
} from '@/infra/lib/nest-kafka/index.js';
import { ItemId, MediaId, OrganizationId, TypeId } from '@/kernel/domain/ids.js';
import type { ItemWidget } from '@/kernel/domain/vo/widget.js';
import type { MediaItem } from '@/kernel/domain/vo/media-item.js';

@KafkaConsumerHandlers(TICKETS_CONSUMER_ID)
@Injectable()
export class TicketTriggerConsumerHandler {
  public constructor(
    private readonly handleTrigger: HandleTriggerEventInteractor,
    private readonly handleClose: HandleCloseTriggerInteractor,
  ) {}

  @ContractHandler(itemModerationContract)
  public async handleItemModeration(
    message: ContractKafkaMessage<typeof itemModerationContract>,
  ): Promise<void> {
    const payload = message.value;

    const domainEvent: TriggerEvent = {
      type: 'item.moderation-requested',
      id: payload.id,
      itemId: ItemId.raw(payload.itemId),
      organizationId: OrganizationId.raw(payload.organizationId),
      typeId: TypeId.raw(payload.typeId),
      widgets: payload.widgets as ItemWidget[],
      submittedAt: new Date(payload.submittedAt),
    };

    await this.handleTrigger.execute(domainEvent);
  }

  @ContractHandler(organizationModerationContract)
  public async handleOrganizationModeration(
    message: ContractKafkaMessage<typeof organizationModerationContract>,
  ): Promise<void> {
    const payload = message.value;

    const domainEvent: TriggerEvent = {
      type: 'organization.moderation-requested',
      id: payload.id,
      organizationId: OrganizationId.raw(payload.organizationId),
      name: payload.name,
      description: payload.description,
      avatarId: payload.avatarId ? MediaId.raw(payload.avatarId) : null,
      media: payload.media.map(
        (m): MediaItem => ({ type: m.type as MediaItem['type'], mediaId: MediaId.raw(m.mediaId) }),
      ),
      submittedAt: new Date(payload.submittedAt),
    };

    await this.handleTrigger.execute(domainEvent);
  }

  @ContractHandler(moderationResultsContract)
  public async handleModerationResult(
    message: ContractKafkaMessage<typeof moderationResultsContract>,
  ): Promise<void> {
    const payload = message.value;

    const closeEvent: CloseEvent = {
      type: payload.type,
      entityType: payload.entityType,
      entityId: payload.entityId,
    };

    await this.handleClose.execute(closeEvent);
  }
}

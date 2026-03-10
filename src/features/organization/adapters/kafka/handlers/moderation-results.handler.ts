import { Injectable } from '@nestjs/common';

import { ApproveInfoModerationHandler } from '../../../application/use-cases/manage-org/approve-info-moderation.handler.js';
import { RejectInfoModerationHandler } from '../../../application/use-cases/manage-org/reject-info-moderation.handler.js';
import { ApproveItemModerationHandler } from '../../../application/use-cases/manage-items/approve-item-moderation.handler.js';
import { RejectItemModerationHandler } from '../../../application/use-cases/manage-items/reject-item-moderation.handler.js';
import { ORGANIZATION_CONSUMER_ID } from '../consumer-ids.js';
import { moderationResultsContract } from '@/infra/kafka-contracts/moderation-results.contract.js';
import {
  ContractHandler,
  type ContractKafkaMessage,
  KafkaConsumerHandlers,
} from '@/infra/lib/nest-kafka/index.js';
import { ItemId, OrganizationId } from '@/kernel/domain/ids.js';

@KafkaConsumerHandlers(ORGANIZATION_CONSUMER_ID)
@Injectable()
export class ModerationResultsKafkaHandler {
  public constructor(
    private readonly approveInfoHandler: ApproveInfoModerationHandler,
    private readonly rejectInfoHandler: RejectInfoModerationHandler,
    private readonly approveItemHandler: ApproveItemModerationHandler,
    private readonly rejectItemHandler: RejectItemModerationHandler,
  ) {}

  @ContractHandler(moderationResultsContract)
  public async handle(
    message: ContractKafkaMessage<typeof moderationResultsContract>,
  ): Promise<void> {
    const payload = message.value;

    if (payload.type === 'moderation.approved') {
      if (payload.entityType === 'organization') {
        await this.approveInfoHandler.handle({
          organizationId: OrganizationId.raw(payload.entityId),
        });
      } else if (payload.entityType === 'item') {
        await this.approveItemHandler.handle({
          itemId: ItemId.raw(payload.entityId),
        });
      }
    } else if (payload.type === 'moderation.rejected') {
      if (payload.entityType === 'organization') {
        await this.rejectInfoHandler.handle({
          organizationId: OrganizationId.raw(payload.entityId),
        });
      } else if (payload.entityType === 'item') {
        await this.rejectItemHandler.handle({
          itemId: ItemId.raw(payload.entityId),
        });
      }
    }
  }
}

import { Injectable } from '@nestjs/common';

import { ProjectOwnerHandler } from '../../application/use-cases/project-owner/project-owner.handler.js';
import { DISCOVERY_CONSUMER_ID } from './consumer-ids.js';
import { organizationStreamingContract } from '@/infra/kafka-contracts/organization.contract.js';
import {
  ContractHandler,
  type ContractKafkaMessage,
  KafkaConsumerHandlers,
} from '@/infra/lib/nest-kafka/index.js';
import { OrganizationId } from '@/kernel/domain/ids.js';

@KafkaConsumerHandlers(DISCOVERY_CONSUMER_ID)
@Injectable()
export class OwnerProjectionKafkaHandler {
  public constructor(private readonly handler: ProjectOwnerHandler) {}

  @ContractHandler(organizationStreamingContract)
  public async handle(
    message: ContractKafkaMessage<typeof organizationStreamingContract>,
  ): Promise<void> {
    const payload = message.value;
    await this.handler.handleOrganizationChanged(
      payload.id,
      OrganizationId.raw(payload.organizationId),
    );
  }
}

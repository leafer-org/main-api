import { Injectable } from '@nestjs/common';

import { ProjectUserHandler } from '../../application/use-cases/project-user/project-user.handler.js';
import { DISCOVERY_CONSUMER_ID } from './consumer-ids.js';
import { userStreamingContract } from '@/infra/kafka-contracts/user.contract.js';
import {
  ContractHandler,
  type ContractKafkaMessage,
  KafkaConsumerHandlers,
} from '@/infra/lib/nest-kafka/index.js';
import { UserId } from '@/kernel/domain/ids.js';

@KafkaConsumerHandlers(DISCOVERY_CONSUMER_ID)
@Injectable()
export class UserProjectionKafkaHandler {
  public constructor(private readonly handler: ProjectUserHandler) {}

  @ContractHandler(userStreamingContract)
  public async handle(
    message: ContractKafkaMessage<typeof userStreamingContract>,
  ): Promise<void> {
    const payload = message.value;

    await this.handler.handleUserEvent(payload.userId, {
      userId: UserId.raw(payload.userId),
      role: payload.role,
      fullName: payload.fullName,
    });
  }
}

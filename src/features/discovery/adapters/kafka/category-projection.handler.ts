import { Injectable } from '@nestjs/common';

import { ProjectCategoryHandler } from '../../application/use-cases/project-category/project-category.handler.js';
import { DISCOVERY_CONSUMER_ID } from './consumer-ids.js';
import { categoryStreamingContract } from '@/infra/kafka-contracts/category.contract.js';
import {
  ContractHandler,
  type ContractKafkaMessage,
  KafkaConsumerHandlers,
} from '@/infra/lib/nest-kafka/index.js';
import { CategoryId } from '@/kernel/domain/ids.js';

@KafkaConsumerHandlers(DISCOVERY_CONSUMER_ID)
@Injectable()
export class CategoryProjectionKafkaHandler {
  public constructor(private readonly handler: ProjectCategoryHandler) {}

  @ContractHandler(categoryStreamingContract)
  public async handle(
    message: ContractKafkaMessage<typeof categoryStreamingContract>,
  ): Promise<void> {
    const payload = message.value;
    await this.handler.handleCategoryChanged(payload.id, CategoryId.raw(payload.categoryId));
  }
}

import { Injectable } from '@nestjs/common';

import { ProjectCategoryHandler } from '../../application/use-cases/project-category/project-category.handler.js';
import { DISCOVERY_CONSUMER_ID } from './consumer-ids.js';
import { categoryStreamingContract } from '@/infra/kafka-contracts/category.contract.js';
import {
  ContractHandler,
  type ContractKafkaMessage,
  KafkaConsumerHandlers,
} from '@/infra/lib/nest-kafka/index.js';
import type {
  CategoryPublishedEvent,
  CategoryUnpublishedEvent,
} from '@/kernel/domain/events/category.events.js';
import { AttributeId, CategoryId, FileId, TypeId } from '@/kernel/domain/ids.js';
import type { AttributeSchema } from '@/kernel/domain/vo/attribute.js';

@KafkaConsumerHandlers(DISCOVERY_CONSUMER_ID)
@Injectable()
export class CategoryProjectionKafkaHandler {
  public constructor(private readonly handler: ProjectCategoryHandler) {}

  @ContractHandler(categoryStreamingContract)
  public async handle(
    message: ContractKafkaMessage<typeof categoryStreamingContract>,
  ): Promise<void> {
    const payload = message.value;

    if (payload.type === 'category.published') {
      await this.handler.handleCategoryPublished(payload.id, {
        id: payload.id,
        type: 'category.published',
        categoryId: CategoryId.raw(payload.categoryId),
        parentCategoryId: payload.parentCategoryId
          ? CategoryId.raw(payload.parentCategoryId)
          : null,
        name: payload.name!,
        iconId: payload.iconId !== null ? FileId.raw(payload.iconId) : null,
        allowedTypeIds: (payload.allowedTypeIds ?? []).map((id) => TypeId.raw(id)),
        ancestorIds: (payload.ancestorIds ?? []).map((id) => CategoryId.raw(id)),
        attributes: (payload.attributes ?? []).map((a) => ({
          attributeId: AttributeId.raw(a.attributeId),
          name: a.name,
          required: a.required,
          schema: a.schema as AttributeSchema,
        })),
        republished: payload.republished ?? false,
        publishedAt: new Date(payload.publishedAt!),
      } satisfies CategoryPublishedEvent);
    } else if (payload.type === 'category.unpublished') {
      await this.handler.handleCategoryUnpublished(payload.id, {
        id: payload.id,
        type: 'category.unpublished',
        categoryId: CategoryId.raw(payload.categoryId),
        unpublishedAt: new Date(payload.unpublishedAt!),
      } satisfies CategoryUnpublishedEvent);
    }
  }
}

import { Injectable } from '@nestjs/common';

import { RepublishChildrenHandler } from '../../application/use-cases/category/republish-children.handler.js';
import { UnpublishChildrenHandler } from '../../application/use-cases/category/unpublish-children.handler.js';
import { CMS_CONSUMER_ID } from './consumer-ids.js';
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
import { AttributeId, CategoryId, MediaId, TypeId } from '@/kernel/domain/ids.js';
import { AgeGroup } from '@/kernel/domain/vo/age-group.js';
import type { AttributeSchema } from '@/kernel/domain/vo/attribute.js';

@KafkaConsumerHandlers(CMS_CONSUMER_ID)
@Injectable()
export class CategoryCascadeKafkaHandler {
  public constructor(
    private readonly republishHandler: RepublishChildrenHandler,
    private readonly unpublishHandler: UnpublishChildrenHandler,
  ) {}

  @ContractHandler(categoryStreamingContract)
  public async handle(
    message: ContractKafkaMessage<typeof categoryStreamingContract>,
  ): Promise<void> {
    const payload = message.value;

    if (payload.type === 'category.published') {
      const event: CategoryPublishedEvent = {
        id: payload.id,
        type: 'category.published',
        categoryId: CategoryId.raw(payload.categoryId),
        parentCategoryId: payload.parentCategoryId
          ? CategoryId.raw(payload.parentCategoryId)
          : null,
        name: payload.name!,
        iconId: MediaId.raw(payload.iconId!),
        allowedTypeIds: (payload.allowedTypeIds ?? []).map((id) => TypeId.raw(id)),
        ancestorIds: (payload.ancestorIds ?? []).map((id) => CategoryId.raw(id)),
        attributes: (payload.attributes ?? []).map((a) => ({
          attributeId: AttributeId.raw(a.attributeId),
          name: a.name,
          required: a.required,
          schema: a.schema as AttributeSchema,
        })),
        ageGroups: (payload.ageGroups ?? []).map(AgeGroup.restore),
        order: payload.order ?? 0,
        republished: payload.republished ?? false,
        publishedAt: new Date(payload.publishedAt!),
      };

      await this.republishHandler.handle(event);
    } else if (payload.type === 'category.unpublished') {
      const event: CategoryUnpublishedEvent = {
        id: payload.id,
        type: 'category.unpublished',
        categoryId: CategoryId.raw(payload.categoryId),
        unpublishedAt: new Date(payload.unpublishedAt!),
      };

      await this.unpublishHandler.handle(event);
    }
  }
}

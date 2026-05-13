import { Inject, Injectable } from '@nestjs/common';

import { RepublishChildrenHandler } from '../../application/use-cases/category/republish-children.handler.js';
import { UnpublishChildrenHandler } from '../../application/use-cases/category/unpublish-children.handler.js';
import { CMS_CONSUMER_ID } from './consumer-ids.js';
import { categoryStreamingContract } from '@/infra/kafka-contracts/category.contract.js';
import {
  ContractHandler,
  type ContractKafkaMessage,
  KafkaConsumerHandlers,
} from '@/infra/lib/nest-kafka/index.js';
import { CategoryDirectoryPort } from '@/kernel/application/ports/category-directory.js';
import type {
  CategoryPublishedEvent,
  CategoryUnpublishedEvent,
} from '@/kernel/domain/events/category.events.js';
import { CategoryId } from '@/kernel/domain/ids.js';

@KafkaConsumerHandlers(CMS_CONSUMER_ID)
@Injectable()
export class CategoryCascadeKafkaHandler {
  public constructor(
    private readonly republishHandler: RepublishChildrenHandler,
    private readonly unpublishHandler: UnpublishChildrenHandler,
    @Inject(CategoryDirectoryPort)
    private readonly categoryDirectory: CategoryDirectoryPort,
  ) {}

  @ContractHandler(categoryStreamingContract)
  public async handle(
    message: ContractKafkaMessage<typeof categoryStreamingContract>,
  ): Promise<void> {
    const payload = message.value;
    const categoryId = CategoryId.raw(payload.categoryId);
    const changedAt = new Date(payload.changedAt);

    // Категория только что изменилась — сбрасываем in-memory cache адаптера,
    // иначе следующий read вернёт устаревший state.
    this.categoryDirectory.clearCache();

    const view = await this.categoryDirectory.findById(categoryId);
    if (!view) return;

    if (view.status === 'published') {
      const event: CategoryPublishedEvent = {
        id: payload.id,
        type: 'category.published',
        categoryId: view.categoryId,
        parentCategoryId: view.parentCategoryId,
        name: view.name,
        iconId: view.iconId,
        order: view.order,
        allowedTypeIds: view.allowedTypeIds,
        ancestorIds: view.ancestorIds.filter((id) => (id as string) !== (view.categoryId as string)),
        attributes: view.attributes,
        ageGroups: view.ageGroups,
        republished: false,
        publishedAt: view.publishedAt ?? changedAt,
      };
      await this.republishHandler.handle(event);
    } else if (view.status === 'unpublished') {
      const event: CategoryUnpublishedEvent = {
        id: payload.id,
        type: 'category.unpublished',
        categoryId: view.categoryId,
        unpublishedAt: changedAt,
      };
      await this.unpublishHandler.handle(event);
    }
  }
}

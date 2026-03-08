import { Inject, Injectable } from '@nestjs/common';

import { CategoryEntity } from '../../../domain/aggregates/category/entity.js';
import { whenCategoryUnpublishedUnpublishChildren } from '../../../domain/policies/when-category-unpublished-unpublish-children.policy.js';
import { CategoryEventPublisher, CategoryRepository } from '../../ports.js';
import { isLeft } from '@/infra/lib/box.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { CategoryUnpublishedEvent } from '@/kernel/domain/events/category.events.js';

@Injectable()
export class UnpublishChildrenHandler {
  public constructor(
    @Inject(CategoryRepository) private readonly categoryRepository: CategoryRepository,
    @Inject(CategoryEventPublisher) private readonly eventPublisher: CategoryEventPublisher,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
  ) {}

  public async handle(event: CategoryUnpublishedEvent): Promise<void> {
    await this.txHost.startTransaction(async (tx) => {
      const children = await this.categoryRepository.findDirectChildren(tx, event.categoryId);

      const commands = whenCategoryUnpublishedUnpublishChildren(event, { children });

      for (const cmd of commands) {
        const child = children.find((c) => (c.id as string) === (cmd.childId as string))!;

        const result = CategoryEntity.unpublish(child, {
          type: 'UnpublishCategory',
          eventId: crypto.randomUUID(),
          now: event.unpublishedAt,
        });

        if (isLeft(result)) continue;

        const { state: newState, event: childEvent } = result.value;
        await this.categoryRepository.save(tx, newState);
        await this.eventPublisher.publishCategoryUnpublished(tx, childEvent);
      }
    });
  }
}

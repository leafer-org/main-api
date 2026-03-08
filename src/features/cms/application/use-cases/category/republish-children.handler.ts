import { Inject, Injectable } from '@nestjs/common';

import { CategoryEntity } from '../../../domain/aggregates/category/entity.js';
import { whenCategoryPublishedRepublishChildren } from '../../../domain/policies/when-category-published-republish-children.policy.js';
import { CategoryEventPublisher, CategoryRepository } from '../../ports.js';
import { isLeft } from '@/infra/lib/box.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { CategoryPublishedEvent } from '@/kernel/domain/events/category.events.js';

@Injectable()
export class RepublishChildrenHandler {
  public constructor(
    @Inject(CategoryRepository) private readonly categoryRepository: CategoryRepository,
    @Inject(CategoryEventPublisher) private readonly eventPublisher: CategoryEventPublisher,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
  ) {}

  public async handle(event: CategoryPublishedEvent): Promise<void> {
    await this.txHost.startTransaction(async (tx) => {
      const children = await this.categoryRepository.findDirectChildren(tx, event.categoryId);

      const commands = whenCategoryPublishedRepublishChildren(event, { children });

      for (const cmd of commands) {
        const child = children.find((c) => (c.id as string) === (cmd.childId as string))!;
        const ancestors = await this.categoryRepository.findAncestors(tx, child.id);

        const result = CategoryEntity.publish(child, {
          type: 'PublishCategory',
          eventId: crypto.randomUUID(),
          ancestorIds: ancestors.map((a) => a.id),
          ancestors: ancestors.map((a) => ({ attributes: a.attributes })),
          now: event.publishedAt,
        });

        if (isLeft(result)) continue;

        const { state: newState, event: childEvent } = result.value;
        await this.categoryRepository.save(tx, newState);
        await this.eventPublisher.publishCategoryPublished(tx, childEvent);
      }
    });
  }
}

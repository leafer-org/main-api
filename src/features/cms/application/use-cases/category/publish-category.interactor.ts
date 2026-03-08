import { Inject, Injectable } from '@nestjs/common';

import { CategoryEntity } from '../../../domain/aggregates/category/entity.js';
import { CategoryNotFoundError } from '../../../domain/aggregates/category/errors.js';
import { CategoryEventPublisher, CategoryRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { type Transaction, TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { CategoryPublishedEvent } from '@/kernel/domain/events/category.events.js';
import type { CategoryId } from '@/kernel/domain/ids.js';
import { Permissions } from '@/kernel/domain/permissions.js';
import { CategoryAttribute } from '@/kernel/domain/vo/category-attribute.js';

@Injectable()
export class PublishCategoryInteractor {
  public constructor(
    @Inject(CategoryRepository) private readonly categoryRepository: CategoryRepository,
    @Inject(CategoryEventPublisher) private readonly eventPublisher: CategoryEventPublisher,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(command: { id: CategoryId }) {
    const auth = await this.permissionCheck.mustCan(Permissions.manageCms);
    if (isLeft(auth)) return auth;

    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.categoryRepository.findById(tx, command.id);
      if (!state) return Left(new CategoryNotFoundError());

      const result = CategoryEntity.publish(state, { type: 'PublishCategory', now });
      if (isLeft(result)) return result;

      const { state: newState, event } = result.value;
      await this.categoryRepository.save(tx, newState);

      // Compute ancestors and merged attributes for integration event
      const ancestors = await this.categoryRepository.findAncestors(tx, command.id);
      const ancestorIds = ancestors.map((a) => a.id);
      const mergedAttributes = CategoryAttribute.mergeWithAncestors(
        newState,
        ancestors
      );

      const integrationEvent: CategoryPublishedEvent = {
        id: crypto.randomUUID(),
        type: 'category.published',
        categoryId: newState.id,
        parentCategoryId: newState.parentCategoryId,
        name: newState.name,
        iconId: newState.iconId,
        allowedTypeIds: newState.allowedTypeIds,
        ancestorIds,
        attributes: mergedAttributes.map((a) => ({
          attributeId: a.attributeId,
          name: a.name,
          required: true,
          schema: a.schema,
        })),
        republished: event.previousStatus !== 'draft',
        publishedAt: now,
      };

      await this.eventPublisher.publishCategoryPublished(tx, integrationEvent);

      // Cascade publish to published descendants
      await this.cascadePublishDescendants(tx, command.id, now);

      return Right(undefined);
    });
  }

  private async cascadePublishDescendants(
    tx: Transaction,
    parentId: CategoryId,
    now: Date,
  ): Promise<void> {
    const descendants = await this.categoryRepository.findDescendants(tx, parentId);
    const publishedDescendants = descendants.filter((d) => d.status === 'published');

    for (const descendant of publishedDescendants) {
      // Recompute ancestors for each descendant
      const ancestors = await this.categoryRepository.findAncestors(tx, descendant.id);
      const ancestorIds = ancestors.map((a) => a.id);
      const mergedAttributes = CategoryAttribute.mergeWithAncestors(
        { attributes: descendant.attributes },
        ancestors.map((a) => ({ attributes: a.attributes })),
      );

      const integrationEvent: CategoryPublishedEvent = {
        id: crypto.randomUUID(),
        type: 'category.published',
        categoryId: descendant.id,
        parentCategoryId: descendant.parentCategoryId,
        name: descendant.name,
        iconId: descendant.iconId,
        allowedTypeIds: descendant.allowedTypeIds,
        ancestorIds,
        attributes: mergedAttributes.map((a) => ({
          attributeId: a.attributeId,
          name: a.name,
          required: true,
          schema: a.schema,
        })),
        republished: true,
        publishedAt: now,
      };

      await this.eventPublisher.publishCategoryPublished(tx, integrationEvent);
    }
  }
}

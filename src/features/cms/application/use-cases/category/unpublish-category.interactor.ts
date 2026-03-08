import { Inject, Injectable } from '@nestjs/common';

import { CategoryEntity } from '../../../domain/aggregates/category/entity.js';
import { CategoryNotFoundError } from '../../../domain/aggregates/category/errors.js';
import { CategoryEventPublisher, CategoryRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { type Transaction, TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { CategoryUnpublishedEvent } from '@/kernel/domain/events/category.events.js';
import type { CategoryId } from '@/kernel/domain/ids.js';
import { Permissions } from '@/kernel/domain/permissions.js';

@Injectable()
export class UnpublishCategoryInteractor {
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

      const result = CategoryEntity.unpublish(state, { type: 'UnpublishCategory', now });
      if (isLeft(result)) return result;

      const { state: newState } = result.value;
      await this.categoryRepository.save(tx, newState);

      const integrationEvent: CategoryUnpublishedEvent = {
        id: crypto.randomUUID(),
        type: 'category.unpublished',
        categoryId: newState.id,
        unpublishedAt: now,
      };

      await this.eventPublisher.publishCategoryUnpublished(tx, integrationEvent);

      // Cascade unpublish to published descendants
      await this.cascadeUnpublishDescendants(tx, command.id, now);

      return Right(undefined);
    });
  }

  private async cascadeUnpublishDescendants(
    tx: Transaction,
    parentId: CategoryId,
    now: Date,
  ): Promise<void> {
    const descendants = await this.categoryRepository.findDescendants(tx, parentId);
    const publishedDescendants = descendants.filter((d) => d.status === 'published');

    for (const descendant of publishedDescendants) {
      const result = CategoryEntity.unpublish(descendant, { type: 'UnpublishCategory', now });
      if (isLeft(result)) continue;

      const { state: newState } = result.value;
      await this.categoryRepository.save(tx, newState);

      const integrationEvent: CategoryUnpublishedEvent = {
        id: crypto.randomUUID(),
        type: 'category.unpublished',
        categoryId: descendant.id,
        unpublishedAt: now,
      };

      await this.eventPublisher.publishCategoryUnpublished(tx, integrationEvent);
    }
  }
}

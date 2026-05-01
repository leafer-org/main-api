import { Inject, Injectable } from '@nestjs/common';

import { CategoryEntity } from '../../../domain/aggregates/category/entity.js';
import { CategoryNotFoundError } from '../../../domain/aggregates/category/errors.js';
import { CategoryEventPublisher, CategoryRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { CategoryId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

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
    const auth = await this.permissionCheck.mustCan(Permission.CmsCategoryPublish);
    if (isLeft(auth)) return auth;

    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.categoryRepository.findById(tx, command.id);
      if (!state) return Left(new CategoryNotFoundError());

      const ancestors = await this.categoryRepository.findAncestors(tx, command.id);

      const result = CategoryEntity.publish(state, {
        type: 'PublishCategory',
        eventId: crypto.randomUUID(),
        ancestorIds: ancestors.map((a) => a.id),
        ancestors: ancestors.map((a) => ({ attributes: a.attributes })),
        now,
      });
      if (isLeft(result)) return result;

      const { state: newState, event } = result.value;
      await this.categoryRepository.save(tx, newState);
      await this.eventPublisher.publishCategoryPublished(tx, event);

      return Right(undefined);
    });
  }
}

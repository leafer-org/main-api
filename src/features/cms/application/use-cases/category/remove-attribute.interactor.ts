import { Inject, Injectable } from '@nestjs/common';

import { CategoryEntity } from '../../../domain/aggregates/category/entity.js';
import { CategoryNotFoundError } from '../../../domain/aggregates/category/errors.js';
import { CategoryRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { AttributeId, CategoryId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class RemoveAttributeInteractor {
  public constructor(
    @Inject(CategoryRepository) private readonly categoryRepository: CategoryRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(command: { categoryId: CategoryId; attributeId: AttributeId }) {
    const auth = await this.permissionCheck.mustCan(Permission.CmsCategoryAttributeRemove);
    if (isLeft(auth)) return auth;

    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.categoryRepository.findById(tx, command.categoryId);
      if (!state) return Left(new CategoryNotFoundError());

      const result = CategoryEntity.removeAttribute(state, {
        type: 'RemoveAttribute',
        attributeId: command.attributeId,
        now,
      });

      if (isLeft(result)) return result;

      const { state: newState } = result.value;
      await this.categoryRepository.save(tx, newState);

      return Right(undefined);
    });
  }
}

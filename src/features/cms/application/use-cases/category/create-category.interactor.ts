import { Inject, Injectable } from '@nestjs/common';

import { CategoryEntity } from '../../../domain/aggregates/category/entity.js';
import { CategoryNotFoundError } from '../../../domain/aggregates/category/errors.js';
import { CategoryRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { CategoryId, FileId, TypeId } from '@/kernel/domain/ids.js';
import { Permissions } from '@/kernel/domain/permissions.js';

@Injectable()
export class CreateCategoryInteractor {
  public constructor(
    @Inject(CategoryRepository) private readonly categoryRepository: CategoryRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(command: {
    id: CategoryId;
    parentCategoryId: CategoryId | null;
    name: string;
    iconId: FileId | null;
    allowedTypeIds: TypeId[];
  }) {
    const auth = await this.permissionCheck.mustCan(Permissions.manageCms);
    if (isLeft(auth)) return auth;

    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      let parentAllowedTypeIds: TypeId[] | null = null;
      if (command.parentCategoryId) {
        const parent = await this.categoryRepository.findById(tx, command.parentCategoryId);
        if (!parent) return Left(new CategoryNotFoundError());
        parentAllowedTypeIds = parent.allowedTypeIds;
      }

      const result = CategoryEntity.create({
        type: 'CreateCategory',
        id: command.id,
        parentCategoryId: command.parentCategoryId,
        name: command.name,
        iconId: command.iconId,
        allowedTypeIds: command.allowedTypeIds,
        parentAllowedTypeIds,
        now,
      });

      if (isLeft(result)) return result;

      const { state } = result.value;
      await this.categoryRepository.save(tx, state);

      return Right(state);
    });
  }
}

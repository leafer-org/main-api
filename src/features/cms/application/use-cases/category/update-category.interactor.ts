import { Inject, Injectable } from '@nestjs/common';

import { CategoryEntity } from '../../../domain/aggregates/category/entity.js';
import { CategoryNotFoundError } from '../../../domain/aggregates/category/errors.js';
import { CategoryRepository } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { MediaService } from '@/kernel/application/ports/media.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { CategoryId, FileId, TypeId } from '@/kernel/domain/ids.js';
import type { AgeGroup } from '@/kernel/domain/vo/age-group.js';
import { Permissions } from '@/kernel/domain/permissions.js';

@Injectable()
export class UpdateCategoryInteractor {
  public constructor(
    @Inject(CategoryRepository) private readonly categoryRepository: CategoryRepository,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
    @Inject(MediaService) private readonly mediaService: MediaService,
  ) {}

  public async execute(command: {
    id: CategoryId;
    name: string;
    iconId: FileId;
    parentCategoryId: CategoryId | null;
    allowedTypeIds: TypeId[];
    ageGroups: AgeGroup[];
  }) {
    const auth = await this.permissionCheck.mustCan(Permissions.manageCms);
    if (isLeft(auth)) return auth;

    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.categoryRepository.findById(tx, command.id);
      if (!state) return Left(new CategoryNotFoundError());

      const oldIconId = state.iconId;

      let parentAllowedTypeIds: TypeId[] | null = null;
      let parentAgeGroups: AgeGroup[] | null = null;
      if (command.parentCategoryId) {
        const parent = await this.categoryRepository.findById(tx, command.parentCategoryId);
        if (!parent) return Left(new CategoryNotFoundError());
        parentAllowedTypeIds = parent.allowedTypeIds;
        parentAgeGroups = parent.ageGroups;
      }

      const result = CategoryEntity.update(state, {
        type: 'UpdateCategory',
        name: command.name,
        iconId: command.iconId,
        parentCategoryId: command.parentCategoryId,
        allowedTypeIds: command.allowedTypeIds,
        ageGroups: command.ageGroups,
        parentAllowedTypeIds,
        parentAgeGroups,
        now,
      });

      if (isLeft(result)) return result;

      const { state: newState } = result.value;
      await this.categoryRepository.save(tx, newState);

      if (newState.iconId !== oldIconId) {
        await this.mediaService.useFiles(tx, [newState.iconId]);
        await this.mediaService.freeFiles(tx, [oldIconId]);
      }

      return Right(newState);
    });
  }
}

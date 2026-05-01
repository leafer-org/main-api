import { Inject, Injectable } from '@nestjs/common';

import { CategoryNotFoundError } from '../../../domain/aggregates/category/errors.js';
import { CategoryQueryPort } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import type { CategoryId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class GetCategoryDetailInteractor {
  public constructor(
    @Inject(CategoryQueryPort) private readonly categoryQuery: CategoryQueryPort,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(command: { id: CategoryId }) {
    const auth = await this.permissionCheck.mustCan(Permission.CmsCategoryRead);
    if (isLeft(auth)) return auth;

    const category = await this.categoryQuery.findDetail(command.id);
    if (!category) return Left(new CategoryNotFoundError());
    return Right(category);
  }
}

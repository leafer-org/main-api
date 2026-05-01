import { Inject, Injectable } from '@nestjs/common';

import { CategoryQueryPort } from '../../ports.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class GetCategoryListInteractor {
  public constructor(
    @Inject(CategoryQueryPort) private readonly categoryQuery: CategoryQueryPort,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute() {
    const auth = await this.permissionCheck.mustCan(Permission.CmsCategoryRead);
    if (isLeft(auth)) return auth;

    const categories = await this.categoryQuery.findAll();
    return Right(categories);
  }
}

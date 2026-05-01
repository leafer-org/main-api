import { Inject, Injectable } from '@nestjs/common';

import { ItemTypeQueryPort } from '../../ports.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class GetItemTypeListInteractor {
  public constructor(
    @Inject(ItemTypeQueryPort) private readonly itemTypeQuery: ItemTypeQueryPort,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute() {
    const auth = await this.permissionCheck.mustCan(Permission.CmsItemTypeRead);
    if (isLeft(auth)) return auth;

    const itemTypes = await this.itemTypeQuery.findAll();
    return Right(itemTypes);
  }
}

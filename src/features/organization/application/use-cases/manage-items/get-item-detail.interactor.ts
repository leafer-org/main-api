import { Inject, Injectable } from '@nestjs/common';

import { ItemQueryPort } from '../../ports.js';
import { OrganizationPermissionCheckService } from '../../organization-permission.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import type { ItemId, OrganizationId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class GetItemDetailInteractor {
  public constructor(
    @Inject(ItemQueryPort) private readonly itemQuery: ItemQueryPort,
    @Inject(OrganizationPermissionCheckService)
    private readonly permissionCheck: OrganizationPermissionCheckService,
  ) {}

  public async execute(command: {
    organizationId: OrganizationId;
    userId: UserId;
    itemId: ItemId;
  }) {
    const auth = await this.permissionCheck.mustBeEmployee(
      command.organizationId,
      command.userId,
    );
    if (isLeft(auth)) return auth;

    const readModel = await this.itemQuery.findDetail(command.itemId);

    return Right(readModel);
  }
}

import { Inject, Injectable } from '@nestjs/common';

import { OrganizationPermissionCheckService } from '../../organization-permission.js';
import { ItemQueryPort } from '../../ports.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import type { OrganizationId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class GetOrganizationItemsInteractor {
  public constructor(
    @Inject(ItemQueryPort) private readonly itemQuery: ItemQueryPort,
    @Inject(OrganizationPermissionCheckService)
    private readonly permissionCheck: OrganizationPermissionCheckService,
  ) {}

  public async execute(command: { organizationId: OrganizationId; userId: UserId }) {
    const auth = await this.permissionCheck.mustBeEmployee(command.organizationId, command.userId);
    if (isLeft(auth)) return auth;

    const readModel = await this.itemQuery.findByOrganizationId(command.organizationId);

    return Right(readModel);
  }
}

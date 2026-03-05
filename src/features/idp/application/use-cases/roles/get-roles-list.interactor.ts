import { Inject, Injectable } from '@nestjs/common';

import { RolesListQueryPort } from '../../ports.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { Permissions } from '@/kernel/domain/permissions.js';

@Injectable()
export class GetRolesListInteractor {
  public constructor(
    @Inject(RolesListQueryPort) private readonly rolesListQuery: RolesListQueryPort,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute() {
    const auth = await this.permissionCheck.mustCan(Permissions.manageRole);
    if (isLeft(auth)) return auth;

    const readModel = await this.rolesListQuery.findAll();

    return Right(readModel);
  }
}

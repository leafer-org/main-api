import { Inject, Injectable } from '@nestjs/common';

import { RoleNotFoundError } from '../../../domain/aggregates/role/errors.js';
import { RoleQueryPort } from '../../ports.js';
import { isLeft, Left, Right } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import type { RoleId } from '@/kernel/domain/ids.js';
import { Permissions } from '@/kernel/domain/permissions.js';

@Injectable()
export class GetRoleInteractor {
  public constructor(
    @Inject(RoleQueryPort) private readonly roleQuery: RoleQueryPort,
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(command: { roleId: RoleId }) {
    const auth = this.permissionCheck.mustCan(Permissions.manageRole);
    if (isLeft(auth)) return auth;

    const readModel = await this.roleQuery.findRole(command.roleId);

    if (!readModel) return Left(new RoleNotFoundError());

    return Right(readModel);
  }
}

import { Inject, Injectable } from '@nestjs/common';

import { AdminUsersListQueryPort } from '../../ports.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class SearchAdminUsersInteractor {
  public constructor(
    @Inject(AdminUsersListQueryPort)
    private readonly query: AdminUsersListQueryPort,
    @Inject(PermissionCheckService)
    private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(params: { query?: string; role?: string; from?: number; size?: number }) {
    const auth = await this.permissionCheck.mustCan(Permission.UserRead);
    if (isLeft(auth)) return auth;

    const result = await this.query.search(params);

    return Right(result);
  }
}

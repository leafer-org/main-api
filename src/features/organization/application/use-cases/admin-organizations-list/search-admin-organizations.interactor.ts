import { Inject, Injectable } from '@nestjs/common';

import { AdminOrganizationsListQueryPort } from '../../ports.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { Permissions } from '@/kernel/domain/permissions.js';

@Injectable()
export class SearchAdminOrganizationsInteractor {
  public constructor(
    @Inject(AdminOrganizationsListQueryPort)
    private readonly query: AdminOrganizationsListQueryPort,
    @Inject(PermissionCheckService)
    private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(params: { query?: string; status?: string; from?: number; size?: number }) {
    const auth = await this.permissionCheck.mustCan(Permissions.moderateOrganization);
    if (isLeft(auth)) return auth;

    const result = await this.query.search(params);

    return Right(result);
  }
}

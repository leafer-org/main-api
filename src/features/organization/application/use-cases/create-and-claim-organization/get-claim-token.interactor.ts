import { Inject, Injectable } from '@nestjs/common';

import { OrganizationQueryPort } from '../../ports.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import type { OrganizationId } from '@/kernel/domain/ids.js';
import { Permission } from '@/kernel/domain/permissions.js';

@Injectable()
export class GetClaimTokenInteractor {
  public constructor(
    @Inject(PermissionCheckService) private readonly permissionCheck: PermissionCheckService,
    @Inject(OrganizationQueryPort) private readonly organizationQuery: OrganizationQueryPort,
  ) {}

  public async execute(command: { organizationId: OrganizationId }) {
    const auth = await this.permissionCheck.mustCan(Permission.OrganizationClaimTokenRegenerate);
    if (isLeft(auth)) return auth;

    const claimToken = await this.organizationQuery.findClaimToken(command.organizationId);
    return Right({ claimToken });
  }
}

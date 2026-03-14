import { Inject, Injectable } from '@nestjs/common';

import { UserSessionsQueryPort } from '../../ports.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { Permissions } from '@/kernel/domain/permissions.js';
import type { UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class GetAdminUserSessionsInteractor {
  public constructor(
    @Inject(UserSessionsQueryPort)
    private readonly sessionsQuery: UserSessionsQueryPort,
    @Inject(PermissionCheckService)
    private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(command: { userId: UserId }) {
    const auth = await this.permissionCheck.mustCan(
      Permissions.manageSession,
      (v) => v === 'all',
    );
    if (isLeft(auth)) return auth;

    const readModel = await this.sessionsQuery.findUserSessions(command.userId);
    return Right(readModel);
  }
}

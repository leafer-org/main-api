import { Inject, Injectable } from '@nestjs/common';

import { SessionRepository } from '../../ports.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import { Permission } from '@/kernel/domain/permissions.js';
import type { UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class DeleteAllAdminSessionsInteractor {
  public constructor(
    @Inject(SessionRepository)
    private readonly sessionRepository: SessionRepository,
    @Inject(TransactionHost)
    private readonly txHost: TransactionHost,
    @Inject(PermissionCheckService)
    private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(command: { userId: UserId }) {
    const auth = await this.permissionCheck.mustCan(Permission.SessionDeleteAll);
    if (isLeft(auth)) return auth;

    return this.txHost.startTransaction(async (tx) => {
      await this.sessionRepository.deleteAllByUserId(tx, command.userId);
      return Right(undefined);
    });
  }
}

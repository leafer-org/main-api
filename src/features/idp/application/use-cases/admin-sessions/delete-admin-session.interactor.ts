import { Inject, Injectable } from '@nestjs/common';

import { SessionEntity } from '../../../domain/aggregates/session/entity.js';
import { SessionRepository } from '../../ports.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import { PermissionCheckService } from '@/kernel/application/ports/permission.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import { Permission } from '@/kernel/domain/permissions.js';
import type { SessionId } from '@/kernel/domain/ids.js';

@Injectable()
export class DeleteAdminSessionInteractor {
  public constructor(
    @Inject(SessionRepository)
    private readonly sessionRepository: SessionRepository,
    @Inject(TransactionHost)
    private readonly txHost: TransactionHost,
    @Inject(PermissionCheckService)
    private readonly permissionCheck: PermissionCheckService,
  ) {}

  public async execute(command: { sessionId: SessionId }) {
    const auth = await this.permissionCheck.mustCan(Permission.SessionDeleteAll);
    if (isLeft(auth)) return auth;

    return this.txHost.startTransaction(async (tx) => {
      const state = await this.sessionRepository.findById(tx, command.sessionId);

      const result = SessionEntity.delete(state, { type: 'DeleteSession' });
      if (isLeft(result)) return result;

      await this.sessionRepository.deleteById(tx, command.sessionId);

      return Right(undefined);
    });
  }
}

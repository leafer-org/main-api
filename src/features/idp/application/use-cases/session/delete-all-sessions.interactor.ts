import { Inject, Injectable } from '@nestjs/common';

import { SessionRepository } from '../../ports.js';
import { Right } from '@/infra/lib/box.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { SessionId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class DeleteAllSessionsInteractor {
  public constructor(
    private readonly sessionRepository: SessionRepository,
    @Inject(TransactionHost)
    private readonly txHost: TransactionHost,
  ) {}

  public async execute(command: { userId: UserId; currentSessionId: SessionId }) {
    return this.txHost.startTransaction(async (tx) => {
      await this.sessionRepository.deleteAllByUserIdExcept(
        tx,
        command.userId,
        command.currentSessionId,
      );

      return Right(undefined);
    });
  }
}

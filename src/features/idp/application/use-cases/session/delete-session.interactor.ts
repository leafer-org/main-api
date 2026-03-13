import { Inject, Injectable } from '@nestjs/common';

import { SessionEntity } from '../../../domain/aggregates/session/entity.js';
import { SessionRepository } from '../../ports.js';
import { isLeft, Right } from '@/infra/lib/box.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { SessionId } from '@/kernel/domain/ids.js';

@Injectable()
export class DeleteSessionInteractor {
  public constructor(
    private readonly sessionRepository: SessionRepository,
    @Inject(TransactionHost)
    private readonly txHost: TransactionHost,
  ) {}

  public async execute(command: { sessionId: SessionId }) {
    return this.txHost.startTransaction(async (tx) => {
      const state = await this.sessionRepository.findById(tx, command.sessionId);

      const result = SessionEntity.delete(state, { type: 'DeleteSession' });
      if (isLeft(result)) return result;

      await this.sessionRepository.deleteById(tx, command.sessionId);

      return Right(undefined);
    });
  }
}

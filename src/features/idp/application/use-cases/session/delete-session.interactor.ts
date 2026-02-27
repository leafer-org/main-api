import { Inject, Injectable } from '@nestjs/common';

import { sessionDecide } from '../../../domain/aggregates/session/decide.js';
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

      const eventEither = sessionDecide(state, { type: 'DeleteSession' });
      if (isLeft(eventEither)) return eventEither;

      await this.sessionRepository.deleteById(tx, command.sessionId);

      return Right(undefined);
    });
  }
}

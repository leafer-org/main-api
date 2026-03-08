import { Inject, Injectable } from '@nestjs/common';

import { LikeWritePort } from '../../ports.js';
import { Right } from '@/infra/lib/box.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { ItemId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class UnlikeItemInteractor {
  public constructor(
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(LikeWritePort) private readonly likeWrite: LikeWritePort,
  ) {}

  public async execute(command: { userId: UserId; itemId: ItemId }) {
    return this.txHost.startTransaction(async (tx) => {
      await this.likeWrite.removeLike(tx, command.userId, command.itemId);
      return Right(undefined);
    });
  }
}

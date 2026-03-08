import { Inject, Injectable } from '@nestjs/common';

import { ItemQueryPort, LikeWritePort } from '../../ports.js';
import { ItemNotFoundError } from './errors.js';
import { Left, Right } from '@/infra/lib/box.js';
import { Clock } from '@/infra/lib/clock.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import type { ItemId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class LikeItemInteractor {
  public constructor(
    @Inject(Clock) private readonly clock: Clock,
    @Inject(TransactionHost) private readonly txHost: TransactionHost,
    @Inject(LikeWritePort) private readonly likeWrite: LikeWritePort,
    @Inject(ItemQueryPort) private readonly itemQuery: ItemQueryPort,
  ) {}

  public async execute(command: { userId: UserId; itemId: ItemId }) {
    const items = await this.itemQuery.findByIds([command.itemId]);
    if (items.length === 0) return Left(new ItemNotFoundError());

    const now = this.clock.now();

    return this.txHost.startTransaction(async (tx) => {
      await this.likeWrite.saveLike(tx, command.userId, command.itemId, now);
      return Right(undefined);
    });
  }
}

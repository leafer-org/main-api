import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

import { LikeWritePort } from '../../../application/ports.js';
import { discoveryUserLikes } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { likeStreamingContract } from '@/infra/kafka-contracts/like.contract.js';
import { OutboxService } from '@/infra/lib/nest-outbox/outbox.service.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { ItemId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleLikeWriteRepository implements LikeWritePort {
  public constructor(
    private readonly txHost: TransactionHostPg,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  public async saveLike(
    tx: Transaction,
    userId: UserId,
    itemId: ItemId,
    likedAt: Date,
  ): Promise<void> {
    const db = this.txHost.get(tx);

    await db
      .insert(discoveryUserLikes)
      .values({
        userId: userId as string,
        itemId: itemId as string,
        likedAt,
      })
      .onConflictDoNothing();

    await this.outbox.enqueue(
      db,
      likeStreamingContract,
      {
        id: uuidv7(),
        type: 'item.liked',
        userId: userId as string,
        itemId: itemId as string,
        timestamp: likedAt.toISOString(),
      },
      { key: userId as string },
    );
  }

  public async removeLike(tx: Transaction, userId: UserId, itemId: ItemId): Promise<void> {
    const db = this.txHost.get(tx);

    await db
      .delete(discoveryUserLikes)
      .where(
        and(
          eq(discoveryUserLikes.userId, userId as string),
          eq(discoveryUserLikes.itemId, itemId as string),
        ),
      );

    await this.outbox.enqueue(
      db,
      likeStreamingContract,
      {
        id: uuidv7(),
        type: 'item.unliked',
        userId: userId as string,
        itemId: itemId as string,
        timestamp: new Date().toISOString(),
      },
      { key: userId as string },
    );
  }
}

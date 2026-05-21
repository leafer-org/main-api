import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { PostLikeRepository } from '../../../application/ports.js';
import { postLikes } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { Clock } from '@/infra/lib/clock.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { PostId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzlePostLikeRepository implements PostLikeRepository {
  public constructor(
    private readonly txHost: TransactionHostPg,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async addLike(tx: Transaction, postId: PostId, userId: UserId): Promise<boolean> {
    const db = this.txHost.get(tx);
    const inserted = await db
      .insert(postLikes)
      .values({
        postId: postId as string,
        userId: userId as string,
        createdAt: this.clock.now(),
      })
      .onConflictDoNothing({ target: [postLikes.postId, postLikes.userId] })
      .returning({ postId: postLikes.postId });
    return inserted.length > 0;
  }

  public async removeLike(tx: Transaction, postId: PostId, userId: UserId): Promise<boolean> {
    const db = this.txHost.get(tx);
    const removed = await db
      .delete(postLikes)
      .where(and(eq(postLikes.postId, postId as string), eq(postLikes.userId, userId as string)))
      .returning({ postId: postLikes.postId });
    return removed.length > 0;
  }
}

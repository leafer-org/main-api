import { Inject, Injectable } from '@nestjs/common';

import { PostViewRepository } from '../../../application/ports.js';
import { postViews } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { Clock } from '@/infra/lib/clock.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import { PostId, type UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzlePostViewRepository implements PostViewRepository {
  public constructor(
    private readonly txHost: TransactionHostPg,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async recordViews(
    tx: Transaction,
    userId: UserId,
    postIds: readonly PostId[],
  ): Promise<{ insertedPostIds: PostId[] }> {
    if (postIds.length === 0) return { insertedPostIds: [] };
    const db = this.txHost.get(tx);
    const now = this.clock.now();
    const values = postIds.map((postId) => ({
      userId: userId as string,
      postId: postId as string,
      viewedAt: now,
    }));
    const inserted = await db
      .insert(postViews)
      .values(values)
      .onConflictDoNothing({ target: [postViews.userId, postViews.postId] })
      .returning({ postId: postViews.postId });
    return { insertedPostIds: inserted.map((r) => PostId.raw(r.postId)) };
  }
}

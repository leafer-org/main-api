import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';

import { OrganizationFreshnessRepository } from '../../../application/ports.js';
import { organizationFreshness, posts } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { Clock } from '@/infra/lib/clock.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import { type OrganizationId, PostId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleOrganizationFreshnessRepository implements OrganizationFreshnessRepository {
  public constructor(
    private readonly txHost: TransactionHostPg,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  public async setLastPost(
    tx: Transaction,
    orgId: OrganizationId,
    lastPostId: PostId | null,
    lastPostAt: Date | null,
  ): Promise<void> {
    const db = this.txHost.get(tx);
    const now = this.clock.now();
    await db
      .insert(organizationFreshness)
      .values({
        organizationId: orgId as string,
        lastPostId: lastPostId as string | null,
        lastPostAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: organizationFreshness.organizationId,
        set: {
          lastPostId: lastPostId as string | null,
          lastPostAt,
          updatedAt: now,
        },
      });
  }

  public async findLatestVisiblePost(
    tx: Transaction,
    orgId: OrganizationId,
  ): Promise<{ postId: PostId; createdAt: Date } | null> {
    const db = this.txHost.get(tx);
    const rows = await db
      .select({ id: posts.id, createdAt: posts.createdAt })
      .from(posts)
      .where(and(eq(posts.organizationId, orgId as string), eq(posts.moderationStatus, 'visible')))
      .orderBy(desc(posts.createdAt))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return { postId: PostId.raw(row.id), createdAt: row.createdAt };
  }
}

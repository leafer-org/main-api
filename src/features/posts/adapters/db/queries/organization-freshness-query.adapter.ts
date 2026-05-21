import { Injectable } from '@nestjs/common';
import { and, gt, inArray, isNotNull, notInArray, sql } from 'drizzle-orm';

import { organizationFreshness, postViews } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { OrganizationFreshnessQueryPort } from '@/kernel/application/ports/organization-freshness-query.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';
import type { OrganizationId, UserId } from '@/kernel/domain/ids.js';

const FRESH_WINDOW_DAYS = 7;

@Injectable()
export class DrizzleOrganizationFreshnessQuery implements OrganizationFreshnessQueryPort {
  public constructor(private readonly txHost: TransactionHostPg) {}

  public async computeFreshOrgIds(
    userId: UserId | null,
    orgIds: readonly OrganizationId[],
  ): Promise<Set<string>> {
    if (userId === null || orgIds.length === 0) return new Set();

    const db = this.txHost.get(NO_TRANSACTION);
    const cutoff = new Date(Date.now() - FRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const orgIdsRaw = orgIds.map((id) => id as string);

    // Шаг 1: получить last_post_id организаций за окно свежести.
    const candidates = await db
      .select({
        organizationId: organizationFreshness.organizationId,
        lastPostId: organizationFreshness.lastPostId,
      })
      .from(organizationFreshness)
      .where(
        and(
          inArray(organizationFreshness.organizationId, orgIdsRaw),
          isNotNull(organizationFreshness.lastPostId),
          gt(organizationFreshness.lastPostAt, cutoff),
        ),
      );

    if (candidates.length === 0) return new Set();
    const lastPostIds = candidates
      .map((c) => c.lastPostId)
      .filter((id): id is string => id !== null);

    // Шаг 2: один батч-запрос — какие из этих last_post_id уже просмотрены user'ом.
    const viewed = await db
      .select({ postId: postViews.postId })
      .from(postViews)
      .where(and(sql`${postViews.userId} = ${userId as string}`, inArray(postViews.postId, lastPostIds)));
    const viewedSet = new Set(viewed.map((v) => v.postId));

    const freshOrgIds = new Set<string>();
    for (const c of candidates) {
      if (c.lastPostId !== null && !viewedSet.has(c.lastPostId)) {
        freshOrgIds.add(c.organizationId);
      }
    }
    return freshOrgIds;
  }
}

// `notInArray` импортируется выше для расширений; здесь используется фильтрация
// in-memory чтобы избежать второго SQL-запроса при пустом множестве viewed.
void notInArray;

import { Inject, Injectable } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { and, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';

import { ReviewQueryPort } from '../../../application/ports.js';
import type { ReviewListItemReadModel } from '../../../domain/read-models/review-list-item.read-model.js';
import type { ReviewState } from '../../../domain/aggregates/review/state.js';
import { toDomain } from '../repositories/review.repository.js';
import { ReviewDatabaseClient } from '../client.js';
import { reviews } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { decodeCursor, encodeCursor } from '@/infra/lib/pagination/index.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { OrganizationId, ReviewId, UserId } from '@/kernel/domain/ids.js';
import type { ReviewTarget } from '@/kernel/domain/events/review.events.js';

@Injectable()
export class DrizzleReviewQuery implements ReviewQueryPort {
  public constructor(
    @Inject(ReviewDatabaseClient) private readonly dbClient: ReviewDatabaseClient,
    private readonly txHost: TransactionHostPg,
  ) {}

  // --- Transactional (for interactors) ---

  public async findByAuthorAndTarget(
    tx: Transaction,
    authorId: UserId,
    target: ReviewTarget,
  ): Promise<ReviewId | null> {
    const db = this.txHost.get(tx);
    const tid = target.targetType === 'item' ? (target.itemId as string) : (target.organizationId as string);

    const rows = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(
        and(
          eq(reviews.authorId, authorId as string),
          eq(reviews.targetType, target.targetType),
          eq(reviews.targetId, tid),
          ne(reviews.status, 'deleted'),
        ),
      )
      .limit(1);

    if (rows.length === 0) return null;
    return rows[0]!.id as ReviewId;
  }

  public async getTargetStats(
    tx: Transaction,
    target: ReviewTarget,
  ): Promise<{ count: number; sum: number }> {
    const db = this.txHost.get(tx);
    const tid = target.targetType === 'item' ? (target.itemId as string) : (target.organizationId as string);

    const result = await db
      .select({
        count: sql<number>`count(*)::int`,
        sum: sql<number>`coalesce(sum(${reviews.rating}), 0)::numeric`,
      })
      .from(reviews)
      .where(
        and(
          eq(reviews.targetType, target.targetType),
          eq(reviews.targetId, tid),
          eq(reviews.status, 'published'),
        ),
      );

    return {
      count: result[0]?.count ?? 0,
      sum: Number(result[0]?.sum ?? 0),
    };
  }

  // --- Read-only (for HTTP controllers) ---

  public async findOneById(reviewId: ReviewId): Promise<ReviewState | null> {
    const rows = await this.dbClient.db
      .select()
      .from(reviews)
      .where(eq(reviews.id, reviewId as string))
      .limit(1);

    if (rows.length === 0) return null;
    return toDomain(rows[0]!.state);
  }

  public async findManyByIds(ids: ReviewId[]): Promise<ReviewState[]> {
    if (ids.length === 0) return [];

    const rows = await this.dbClient.db
      .select()
      .from(reviews)
      .where(inArray(reviews.id, ids as string[]));

    return rows.map((row) => toDomain(row.state));
  }

  public async findByTarget(params: {
    targetType: string;
    targetId: string;
    callerUserId?: UserId;
    cursor?: string;
    limit: number;
  }): Promise<{ items: ReviewListItemReadModel[]; nextCursor: string | null }> {
    const conditions: SQL[] = [
      eq(reviews.targetType, params.targetType),
      eq(reviews.targetId, params.targetId),
    ];

    // Published reviews + caller's own pending review
    if (params.callerUserId) {
      conditions.push(
        or(
          eq(reviews.status, 'published'),
          and(
            eq(reviews.status, 'pending'),
            eq(reviews.authorId, params.callerUserId as string),
          ),
        )!,
      );
    } else {
      conditions.push(eq(reviews.status, 'published'));
    }

    return this.paginatedList(conditions, params.cursor, params.limit, params.callerUserId);
  }

  public async findByAuthor(params: {
    authorId: UserId;
    cursor?: string;
    limit: number;
  }): Promise<{ items: ReviewListItemReadModel[]; nextCursor: string | null }> {
    const conditions: SQL[] = [
      eq(reviews.authorId, params.authorId as string),
      ne(reviews.status, 'deleted'),
    ];

    return this.paginatedList(conditions, params.cursor, params.limit, params.authorId);
  }

  public async findByOrganization(params: {
    organizationId: OrganizationId;
    cursor?: string;
    limit: number;
  }): Promise<{ items: ReviewListItemReadModel[]; nextCursor: string | null }> {
    const conditions: SQL[] = [
      eq(reviews.organizationId, params.organizationId as string),
      eq(reviews.status, 'published'),
    ];

    return this.paginatedList(conditions, params.cursor, params.limit);
  }

  // --- Private helpers ---

  private async paginatedList(
    conditions: SQL[],
    cursor: string | undefined,
    limit: number,
    callerUserId?: UserId,
  ): Promise<{ items: ReviewListItemReadModel[]; nextCursor: string | null }> {
    if (cursor) {
      const parsed = decodeCursor<{ createdAt: string; id: string }>(cursor);
      conditions.push(
        sql`(${reviews.createdAt}, ${reviews.id}) < (${parsed.createdAt}::timestamptz, ${parsed.id})`,
      );
    }

    const rows = await this.dbClient.db
      .select()
      .from(reviews)
      .where(and(...conditions))
      .orderBy(desc(reviews.createdAt), desc(reviews.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const resultRows = hasMore ? rows.slice(0, limit) : rows;

    const items: ReviewListItemReadModel[] = resultRows.map((row) => {
      const state = row.state as Record<string, unknown>;
      const isMine = callerUserId ? row.authorId === (callerUserId as string) : false;

      return {
        reviewId: row.id,
        authorId: row.authorId,
        targetType: row.targetType,
        targetId: row.targetId,
        rating: row.rating,
        text: (state['text'] as string | null) ?? null,
        status: row.status,
        replyText: (state['replyText'] as string | null) ?? null,
        repliedAt: state['repliedAt'] ? new Date(state['repliedAt'] as string) : null,
        isMine,
        isPending: row.status === 'pending',
        createdAt: row.createdAt,
      };
    });

    const lastRow = resultRows.at(-1);
    const nextCursor =
      hasMore && lastRow
        ? encodeCursor({ createdAt: lastRow.createdAt.toISOString(), id: lastRow.id })
        : null;

    return { items, nextCursor };
  }
}

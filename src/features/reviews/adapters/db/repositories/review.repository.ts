import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { ReviewRepository } from '../../../application/ports.js';
import type { ReviewState } from '../../../domain/aggregates/review/state.js';
import { reviews } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { ReviewId } from '@/kernel/domain/ids.js';

function targetId(state: ReviewState): string {
  return state.target.targetType === 'item'
    ? (state.target.itemId as string)
    : (state.target.organizationId as string);
}

@Injectable()
export class DrizzleReviewRepository extends ReviewRepository {
  public constructor(private readonly txHost: TransactionHostPg) {
    super();
  }

  public async findById(tx: Transaction, reviewId: ReviewId): Promise<ReviewState | null> {
    const db = this.txHost.get(tx);
    const rows = await db
      .select()
      .from(reviews)
      .where(eq(reviews.id, reviewId as string))
      .limit(1);
    const row = rows[0];
    if (!row) return null;

    return toDomain(row.state);
  }

  public async save(tx: Transaction, state: ReviewState): Promise<void> {
    const db = this.txHost.get(tx);

    await db
      .insert(reviews)
      .values({
        id: state.reviewId as string,
        authorId: state.authorId as string,
        targetType: state.target.targetType,
        targetId: targetId(state),
        organizationId: state.organizationId as string,
        status: state.status,
        rating: state.rating as number,
        state: toJson(state),
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      })
      .onConflictDoUpdate({
        target: reviews.id,
        set: {
          status: state.status,
          rating: state.rating as number,
          state: toJson(state),
          updatedAt: state.updatedAt,
        },
      });
  }
}

function toJson(state: ReviewState): unknown {
  return {
    ...state,
    createdAt: state.createdAt.toISOString(),
    updatedAt: state.updatedAt.toISOString(),
    repliedAt: state.repliedAt?.toISOString() ?? null,
    disputedAt: state.disputedAt?.toISOString() ?? null,
  };
}

export function toDomain(json: unknown): ReviewState {
  const raw = json as Record<string, unknown>;
  return {
    ...(raw as unknown as ReviewState),
    createdAt: new Date(raw['createdAt'] as string),
    updatedAt: new Date(raw['updatedAt'] as string),
    repliedAt: raw['repliedAt'] ? new Date(raw['repliedAt'] as string) : null,
    disputedAt: raw['disputedAt'] ? new Date(raw['disputedAt'] as string) : null,
  };
}

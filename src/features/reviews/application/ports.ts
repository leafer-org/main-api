import type { ReviewState } from '../domain/aggregates/review/state.js';
import type { ReviewListItemReadModel } from '../domain/read-models/review-list-item.read-model.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type {
  ReviewCreatedEvent,
  ReviewDeletedEvent,
  ReviewTarget,
} from '@/kernel/domain/events/review.events.js';
import type { OrganizationId, ReviewId, UserId } from '@/kernel/domain/ids.js';

// --- Review repository ---

export abstract class ReviewRepository {
  public abstract findById(tx: Transaction, reviewId: ReviewId): Promise<ReviewState | null>;
  public abstract save(tx: Transaction, state: ReviewState): Promise<void>;
}

// --- Review query port ---

export abstract class ReviewQueryPort {
  // --- Transactional (for interactors) ---

  public abstract findByAuthorAndTarget(
    tx: Transaction,
    authorId: UserId,
    target: ReviewTarget,
  ): Promise<ReviewId | null>;

  public abstract getTargetStats(
    tx: Transaction,
    target: ReviewTarget,
  ): Promise<{ count: number; sum: number }>;

  // --- Read-only (for HTTP controllers) ---

  public abstract findOneById(reviewId: ReviewId): Promise<ReviewState | null>;

  public abstract findManyByIds(ids: ReviewId[]): Promise<ReviewState[]>;

  public abstract findByTarget(params: {
    targetType: string;
    targetId: string;
    callerUserId?: UserId;
    cursor?: string;
    limit: number;
  }): Promise<{ items: ReviewListItemReadModel[]; nextCursor: string | null }>;

  public abstract findByAuthor(params: {
    authorId: UserId;
    cursor?: string;
    limit: number;
  }): Promise<{ items: ReviewListItemReadModel[]; nextCursor: string | null }>;

  public abstract findByOrganization(params: {
    organizationId: OrganizationId;
    cursor?: string;
    limit: number;
  }): Promise<{ items: ReviewListItemReadModel[]; nextCursor: string | null }>;
}

// --- Review event publisher ---

export abstract class ReviewEventPublisher {
  public abstract publishReviewCreated(tx: Transaction, event: ReviewCreatedEvent): Promise<void>;

  public abstract publishReviewDeleted(tx: Transaction, event: ReviewDeletedEvent): Promise<void>;
}

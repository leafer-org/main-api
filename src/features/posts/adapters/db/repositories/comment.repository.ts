import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { CommentRepository } from '../../../application/ports.js';
import type {
  CommentModerationStatus,
  CommentState,
} from '../../../domain/aggregates/comment/state.js';
import { postComments } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import { PostCommentId, PostId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleCommentRepository implements CommentRepository {
  public constructor(private readonly txHost: TransactionHostPg) {}

  public async findById(
    tx: Transaction,
    commentId: PostCommentId,
  ): Promise<CommentState | null> {
    const db = this.txHost.get(tx);
    const rows = await db
      .select()
      .from(postComments)
      .where(eq(postComments.id, commentId as string))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      commentId: PostCommentId.raw(row.id),
      postId: PostId.raw(row.postId),
      authorUserId: UserId.raw(row.authorUserId),
      text: row.text,
      moderationStatus: row.moderationStatus as CommentModerationStatus,
      createdAt: row.createdAt,
    };
  }

  public async save(tx: Transaction, state: CommentState): Promise<void> {
    const db = this.txHost.get(tx);
    await db
      .insert(postComments)
      .values({
        id: state.commentId as string,
        postId: state.postId as string,
        authorUserId: state.authorUserId as string,
        text: state.text,
        moderationStatus: state.moderationStatus,
        createdAt: state.createdAt,
      })
      .onConflictDoUpdate({
        target: postComments.id,
        set: {
          text: state.text,
          moderationStatus: state.moderationStatus,
        },
      });
  }

  public async delete(tx: Transaction, commentId: PostCommentId): Promise<void> {
    const db = this.txHost.get(tx);
    await db.delete(postComments).where(eq(postComments.id, commentId as string));
  }
}

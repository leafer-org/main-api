import { Injectable } from '@nestjs/common';
import { and, asc, eq, gt, or } from 'drizzle-orm';

import {
  type CommentListItem,
  type CommentListPage,
  CommentQueryPort,
} from '../../../application/ports.js';
import { postComments } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { decodeCursor, encodeCursor } from '@/infra/lib/pagination/index.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';
import { PostCommentId, PostId, type UserId } from '@/kernel/domain/ids.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

type Cursor = { createdAt: string; id: string };

@Injectable()
export class DrizzleCommentQuery implements CommentQueryPort {
  public constructor(private readonly txHost: TransactionHostPg) {}

  public async findByPost(
    postId: PostId,
    viewerUserId: UserId | null,
    params: { cursor?: string; limit?: number; includeHidden: boolean },
  ): Promise<CommentListPage> {
    void viewerUserId;
    const db = this.txHost.get(NO_TRANSACTION);
    const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = params.cursor === undefined ? null : decodeCursor<Cursor>(params.cursor);

    const conditions = [eq(postComments.postId, postId as string)];
    if (!params.includeHidden) {
      conditions.push(eq(postComments.moderationStatus, 'visible'));
    }
    if (cursor !== null) {
      const cursorDate = new Date(cursor.createdAt);
      conditions.push(
        or(
          gt(postComments.createdAt, cursorDate),
          and(eq(postComments.createdAt, cursorDate), gt(postComments.id, cursor.id)),
        )!,
      );
    }

    const rows = await db
      .select()
      .from(postComments)
      .where(and(...conditions))
      .orderBy(asc(postComments.createdAt), asc(postComments.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items: CommentListItem[] = rows.slice(0, limit).map((r) => ({
      commentId: PostCommentId.raw(r.id),
      postId: PostId.raw(r.postId),
      authorUserId: r.authorUserId as UserId,
      text: r.text,
      moderationStatus: r.moderationStatus as 'visible' | 'hidden',
      createdAt: r.createdAt,
    }));
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last !== undefined
        ? encodeCursor<Cursor>({ createdAt: last.createdAt.toISOString(), id: last.commentId as string })
        : null;

    return { comments: items, nextCursor };
  }
}

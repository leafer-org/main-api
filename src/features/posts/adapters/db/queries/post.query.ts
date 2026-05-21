import { Injectable } from '@nestjs/common';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';

import {
  type PostListItem,
  type PostListPage,
  PostQueryPort,
} from '../../../application/ports.js';
import { postLikes, posts } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { decodeCursor, encodeCursor } from '@/infra/lib/pagination/index.js';
import { NO_TRANSACTION } from '@/kernel/application/ports/tx-host.js';
import {
  type MediaId,
  OrganizationId,
  PostId,
  type UserId,
} from '@/kernel/domain/ids.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

type Cursor = { createdAt: string; id: string };

@Injectable()
export class DrizzlePostQuery implements PostQueryPort {
  public constructor(private readonly txHost: TransactionHostPg) {}

  public async findById(
    postId: PostId,
    viewerUserId: UserId | null,
  ): Promise<PostListItem | null> {
    const db = this.txHost.get(NO_TRANSACTION);
    const rows = await db
      .select({
        post: posts,
        viewerLikedRaw: viewerUserId === null ? sql<null>`NULL`.as('viewer_liked') : postLikes.userId,
      })
      .from(posts)
      .leftJoin(
        postLikes,
        viewerUserId === null
          ? sql`false`
          : and(eq(postLikes.postId, posts.id), eq(postLikes.userId, viewerUserId as string)),
      )
      .where(eq(posts.id, postId as string))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return toListItem(row.post, row.viewerLikedRaw !== null);
  }

  public async findByOrganization(
    orgId: OrganizationId,
    viewerUserId: UserId | null,
    params: { cursor?: string; limit?: number; includeHidden: boolean },
  ): Promise<PostListPage> {
    const db = this.txHost.get(NO_TRANSACTION);
    const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = params.cursor === undefined ? null : decodeCursor<Cursor>(params.cursor);

    const conditions = [eq(posts.organizationId, orgId as string)];
    if (!params.includeHidden) {
      conditions.push(eq(posts.moderationStatus, 'visible'));
    }
    if (cursor !== null) {
      const cursorDate = new Date(cursor.createdAt);
      conditions.push(
        or(
          lt(posts.createdAt, cursorDate),
          and(eq(posts.createdAt, cursorDate), lt(posts.id, cursor.id)),
        )!,
      );
    }

    const rows = await db
      .select({
        post: posts,
        viewerLikedRaw:
          viewerUserId === null ? sql<null>`NULL`.as('viewer_liked') : postLikes.userId,
      })
      .from(posts)
      .leftJoin(
        postLikes,
        viewerUserId === null
          ? sql`false`
          : and(eq(postLikes.postId, posts.id), eq(postLikes.userId, viewerUserId as string)),
      )
      .where(and(...conditions))
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((r) => toListItem(r.post, r.viewerLikedRaw !== null));
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last !== undefined
        ? encodeCursor<Cursor>({ createdAt: last.createdAt.toISOString(), id: last.postId as string })
        : null;

    return { posts: items, nextCursor };
  }
}

type StoredMedia = { type: 'image' | 'video'; mediaId: string };

function toListItem(row: typeof posts.$inferSelect, viewerLiked: boolean): PostListItem {
  return {
    postId: PostId.raw(row.id),
    organizationId: OrganizationId.raw(row.organizationId),
    authorUserId: row.authorUserId as UserId,
    text: row.text,
    media: parseMedia(row.media),
    moderationStatus: row.moderationStatus as 'visible' | 'hidden',
    likeCount: row.likeCount,
    commentCount: row.commentCount,
    viewCount: row.viewCount,
    viewerLiked,
    editedAt: row.editedAt,
    createdAt: row.createdAt,
  };
}

function parseMedia(raw: unknown): ReadonlyArray<{ type: 'image' | 'video'; mediaId: MediaId }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is StoredMedia =>
        typeof item === 'object' &&
        item !== null &&
        (item as Partial<StoredMedia>).type !== undefined &&
        typeof (item as Partial<StoredMedia>).mediaId === 'string',
    )
    .map((item) => ({ type: item.type, mediaId: item.mediaId as MediaId }));
}

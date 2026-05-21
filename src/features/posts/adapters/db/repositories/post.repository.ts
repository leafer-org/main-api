import { Injectable } from '@nestjs/common';
import { eq, inArray, sql } from 'drizzle-orm';

import { PostRepository } from '../../../application/ports.js';
import type {
  PostMediaItem,
  PostModerationStatus,
  PostState,
} from '../../../domain/aggregates/post/state.js';
import { posts } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import {
  type MediaId,
  OrganizationId,
  PostId,
  UserId,
} from '@/kernel/domain/ids.js';

type StoredMedia = { type: 'image' | 'video'; mediaId: string };

@Injectable()
export class DrizzlePostRepository implements PostRepository {
  public constructor(private readonly txHost: TransactionHostPg) {}

  public async findById(tx: Transaction, postId: PostId): Promise<PostState | null> {
    const db = this.txHost.get(tx);
    const rows = await db.select().from(posts).where(eq(posts.id, postId as string)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return hydrate(row);
  }

  public async save(tx: Transaction, state: PostState): Promise<void> {
    const db = this.txHost.get(tx);
    const mediaJson: StoredMedia[] = state.media.map((m) => ({
      type: m.type,
      mediaId: m.mediaId as string,
    }));
    await db
      .insert(posts)
      .values({
        id: state.postId as string,
        organizationId: state.organizationId as string,
        authorUserId: state.authorUserId as string,
        text: state.text,
        media: mediaJson,
        moderationStatus: state.moderationStatus,
        editedAt: state.editedAt,
        createdAt: state.createdAt,
      })
      .onConflictDoUpdate({
        target: posts.id,
        set: {
          text: state.text,
          media: mediaJson,
          moderationStatus: state.moderationStatus,
          editedAt: state.editedAt,
        },
      });
  }

  public async delete(tx: Transaction, postId: PostId): Promise<void> {
    const db = this.txHost.get(tx);
    await db.delete(posts).where(eq(posts.id, postId as string));
  }

  public async incrementLikeCount(
    tx: Transaction,
    postId: PostId,
    delta: number,
  ): Promise<void> {
    const db = this.txHost.get(tx);
    await db
      .update(posts)
      .set({ likeCount: sql`GREATEST(0, ${posts.likeCount} + ${delta})` })
      .where(eq(posts.id, postId as string));
  }

  public async incrementCommentCount(
    tx: Transaction,
    postId: PostId,
    delta: number,
  ): Promise<void> {
    const db = this.txHost.get(tx);
    await db
      .update(posts)
      .set({ commentCount: sql`GREATEST(0, ${posts.commentCount} + ${delta})` })
      .where(eq(posts.id, postId as string));
  }

  public async incrementViewCount(
    tx: Transaction,
    postIds: readonly PostId[],
  ): Promise<void> {
    if (postIds.length === 0) return;
    const db = this.txHost.get(tx);
    await db
      .update(posts)
      .set({ viewCount: sql`${posts.viewCount} + 1` })
      .where(inArray(posts.id, postIds as readonly string[]));
  }
}

function hydrate(row: typeof posts.$inferSelect): PostState {
  return {
    postId: PostId.raw(row.id),
    organizationId: OrganizationId.raw(row.organizationId),
    authorUserId: UserId.raw(row.authorUserId),
    text: row.text,
    media: parseMedia(row.media),
    moderationStatus: row.moderationStatus as PostModerationStatus,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
  };
}

function parseMedia(raw: unknown): readonly PostMediaItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is StoredMedia =>
        typeof item === 'object' &&
        item !== null &&
        (item as Partial<StoredMedia>).type !== undefined &&
        typeof (item as Partial<StoredMedia>).mediaId === 'string',
    )
    .map((item) => ({
      type: item.type,
      mediaId: item.mediaId as MediaId,
    }));
}

import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const posts = pgTable(
  'posts',
  {
    id: uuid('id').primaryKey(),
    organizationId: text('organization_id').notNull(),
    authorUserId: text('author_user_id').notNull(),
    text: text('text').notNull().default(''),
    // Хранится как массив { type: 'image'|'video', mediaId } в jsonb.
    media: jsonb('media').notNull().default([]),
    moderationStatus: text('moderation_status').notNull().default('visible'),
    likeCount: integer('like_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    viewCount: integer('view_count').notNull().default(0),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    // Главный индекс для GET /organizations/:orgId/posts с курсорной пагинацией.
    index('posts_org_created_idx').on(table.organizationId, table.createdAt),
    index('posts_author_idx').on(table.authorUserId),
    // Для пересчёта organization_freshness после delete/hide. Partial-индекс
    // по visible — drizzle поддерживает через .where().
    index('posts_org_visible_created_idx')
      .on(table.organizationId, table.createdAt)
      .where(sql`${table.moderationStatus} = 'visible'`),
  ],
);

export const postLikes = pgTable(
  'post_likes',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.userId] }),
    index('post_likes_user_idx').on(table.userId),
  ],
);

export const postComments = pgTable(
  'post_comments',
  {
    id: uuid('id').primaryKey(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorUserId: text('author_user_id').notNull(),
    text: text('text').notNull(),
    moderationStatus: text('moderation_status').notNull().default('visible'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
  },
  (table) => [
    // Курсорная пагинация по (postId, createdAt). createdAt asc — старые сверху.
    index('post_comments_post_created_idx').on(table.postId, table.createdAt),
    index('post_comments_author_idx').on(table.authorUserId),
  ],
);

/**
 * Per-user view tracking. Composite PK (user_id, post_id) — естественная
 * уникальность «один user видел один пост». FK CASCADE удалит строки при
 * hard-delete поста или user'а.
 */
export const postViews = pgTable(
  'post_views',
  {
    userId: text('user_id').notNull(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    viewedAt: timestamp('viewed_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.postId] }),
    index('post_views_post_idx').on(table.postId),
  ],
);

/**
 * Read-model «свежесть постов на организации». Обновляется реактивно от
 * post.* событий. Discovery JOIN'ит таблицу при формировании feed.
 *
 * last_post_id / last_post_at — последний VISIBLE пост. При hide/delete
 * пересчитывается на предпоследний visible (или null).
 */
export const organizationFreshness = pgTable(
  'organization_freshness',
  {
    organizationId: text('organization_id').primaryKey(),
    lastPostId: uuid('last_post_id'),
    lastPostAt: timestamp('last_post_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    // Для GET /feed: фильтр «есть свежий пост за 7 дней» — индекс по last_post_at.
    index('org_freshness_last_post_at_idx').on(table.lastPostAt),
  ],
);

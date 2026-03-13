import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey(),
    authorId: text('author_id').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    organizationId: text('organization_id').notNull(),
    status: text('status').notNull(),
    rating: real('rating').notNull(),
    state: jsonb('state').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('reviews_author_target_idx').on(table.authorId, table.targetType, table.targetId),
    index('reviews_target_status_idx').on(table.targetType, table.targetId, table.status),
    index('reviews_organization_status_idx').on(table.organizationId, table.status),
    uniqueIndex('reviews_author_target_active_idx')
      .on(table.authorId, table.targetType, table.targetId)
      .where(sql`status NOT IN ('deleted')`),
  ],
);

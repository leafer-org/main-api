import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const media = pgTable('media', {
  id: uuid('id').primaryKey(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  bucket: text('bucket').notNull(),
  mimeType: text('mime_type').notNull(),
  isTemporary: boolean('is_temporary').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type MediaRow = typeof media.$inferSelect;
export type NewMediaRow = typeof media.$inferInsert;

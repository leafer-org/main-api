import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const files = pgTable('files', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  bucket: text('bucket').notNull(),
  mimeType: text('mime_type').notNull(),
  isTemporary: boolean('is_temporary').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type FileRow = typeof files.$inferSelect;
export type NewFileRow = typeof files.$inferInsert;

import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const media = pgTable('media', {
  id: uuid('id').primaryKey(),
  type: text('type').notNull(),
  name: text('name').notNull(),
  bucket: text('bucket').notNull(),
  mimeType: text('mime_type').notNull(),
  isTemporary: boolean('is_temporary').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  width: integer('width'),
  height: integer('height'),
  verifiedMimeType: text('verified_mime_type'),
});

export const videoDetails = pgTable('video_details', {
  mediaId: uuid('media_id').primaryKey().references(() => media.id),
  processingStatus: text('processing_status').notNull().default('pending'),
  thumbnailMediaId: uuid('thumbnail_media_id'),
  hlsManifestKey: text('hls_manifest_key'),
  mp4PreviewKey: text('mp4_preview_key'),
  duration: integer('duration'),
  width: integer('width'),
  height: integer('height'),
});

export type MediaRow = typeof media.$inferSelect;
export type NewMediaRow = typeof media.$inferInsert;
export type VideoDetailsRow = typeof videoDetails.$inferSelect;
export type NewVideoDetailsRow = typeof videoDetails.$inferInsert;

import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const serviceListings = pgTable('service_listings', {
  serviceId: uuid('service_id').primaryKey(),
  components: jsonb('components').notNull(),
  categoryId: uuid('category_id'),
  organizationId: uuid('organization_id'),
  ageGroup: text('age_group'),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const attributes = pgTable('attributes', {
  attributeId: uuid('attribute_id').primaryKey(),
  categoryId: uuid('category_id').notNull(),
  name: text('name').notNull(),
  schema: jsonb('schema').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

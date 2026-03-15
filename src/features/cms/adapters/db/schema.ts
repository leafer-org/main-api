import { doublePrecision, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const cmsCategories = pgTable('cms_categories', {
  id: uuid('id').primaryKey(),
  parentCategoryId: uuid('parent_category_id'),
  name: text('name').notNull(),
  iconId: uuid('icon_id').notNull(),
  allowedTypeIds: jsonb('allowed_type_ids').notNull().default([]),
  ageGroups: jsonb('age_groups').notNull().default([]),
  attributes: jsonb('attributes').notNull().default([]),
  status: text('status').notNull().default('draft'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export type CmsCategoryRow = typeof cmsCategories.$inferSelect;

export const cmsItemTypes = pgTable('cms_item_types', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  availableWidgetTypes: jsonb('available_widget_types').notNull().default([]),
  requiredWidgetTypes: jsonb('required_widget_types').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export type CmsItemTypeRow = typeof cmsItemTypes.$inferSelect;

export const cmsCities = pgTable('cms_cities', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
});

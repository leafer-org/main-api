import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const cmsCategories = pgTable(
  'cms_categories',
  {
    id: uuid('id').primaryKey(),
    parentCategoryId: uuid('parent_category_id'),
    name: text('name').notNull(),
    iconId: uuid('icon_id').notNull(),
    order: integer('order').notNull().default(0),
    allowedTypeIds: jsonb('allowed_type_ids').notNull().default([]),
    ageGroups: jsonb('age_groups').notNull().default([]),
    attributes: jsonb('attributes').notNull().default([]),
    status: text('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    // Используется в рекурсивном CTE (поднятие по предкам / спуск по потомкам).
    index('cms_categories_parent_idx').on(table.parentCategoryId),
    // Список published-категорий с естественной сортировкой
    // (`findAllPublished`, `findPublishedByParentId`).
    index('cms_categories_status_order_name_idx').on(table.status, table.order, table.name),
  ],
);

export type CmsCategoryRow = typeof cmsCategories.$inferSelect;

export const cmsItemTypes = pgTable('cms_item_types', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  label: text('label').notNull(),
  widgetSettings: jsonb('widget_settings').notNull().default([]),
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

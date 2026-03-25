/**
 * Денормализованные таблицы Discovery для быстрого чтения и фильтрации.
 * Без FK constraints — неконсистентности обрабатываются на чтении. Hard delete при удалении сущностей.
 */
import {
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// --- Items ---

export const discoveryItems = pgTable(
  'discovery_items',
  {
    id: uuid('id').primaryKey(),
    typeId: text('type_id').notNull(),
    title: text('title'),
    description: text('description'),
    media: jsonb('media').$type<{ type: string; mediaId: string }[]>().notNull().default([]),
    ageGroup: text('age_group'),
    cityId: text('city_id'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    address: text('address'),
    paymentOptions: jsonb('payment_options').$type<{ name: string; description: string | null; strategy: string; price: number | null }[]>(),
    minPrice: numeric('min_price'),
    organizationId: text('organization_id'),
    ownerName: text('owner_name'),
    ownerAvatarId: text('owner_avatar_id'),
    itemRating: numeric('item_rating'),
    itemReviewCount: integer('item_review_count').notNull().default(0),
    ownerRating: numeric('owner_rating'),
    ownerReviewCount: integer('owner_review_count').notNull().default(0),
    widgets: jsonb('widgets').$type<unknown[]>().notNull().default([]),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('discovery_items_city_age_idx').on(table.cityId, table.ageGroup),
    index('discovery_items_org_idx').on(table.organizationId),
    index('discovery_items_price_idx').on(table.minPrice),
    index('discovery_items_rating_idx').on(table.itemRating),
    index('discovery_items_published_at_idx').on(table.publishedAt),
  ],
);

// --- Item Junction Tables ---

export const discoveryItemCategories = pgTable(
  'discovery_item_categories',
  {
    itemId: uuid('item_id').notNull(),
    categoryId: text('category_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.categoryId] }),
    index('discovery_item_categories_category_idx').on(table.categoryId),
  ],
);

export const discoveryItemAttributes = pgTable(
  'discovery_item_attributes',
  {
    itemId: uuid('item_id').notNull(),
    attributeId: text('attribute_id').notNull(),
    value: text('value').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.attributeId, table.value] }),
    index('discovery_item_attributes_attr_value_idx').on(table.attributeId, table.value),
  ],
);

export const discoveryItemEventDates = pgTable(
  'discovery_item_event_dates',
  {
    itemId: uuid('item_id').notNull(),
    eventDate: timestamp('event_date', { withTimezone: true }).notNull(),
    label: text('label'),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.eventDate] }),
    index('discovery_item_event_dates_date_idx').on(table.eventDate),
  ],
);

export const discoveryItemSchedules = pgTable(
  'discovery_item_schedules',
  {
    itemId: uuid('item_id').notNull(),
    dayOfWeek: integer('day_of_week').notNull(),
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.dayOfWeek, table.startTime, table.endTime] }),
    index('discovery_item_schedules_day_idx').on(table.dayOfWeek),
    index('discovery_item_schedules_time_idx').on(table.startTime, table.endTime),
  ],
);

// --- Categories ---

export const discoveryCategories = pgTable('discovery_categories', {
  id: uuid('id').primaryKey(),
  parentCategoryId: text('parent_category_id'),
  name: text('name').notNull(),
  iconId: text('icon_id').notNull(),
  order: integer('order').notNull().default(0),
  allowedTypeIds: jsonb('allowed_type_ids').$type<string[]>().notNull().default([]),
  ancestorIds: jsonb('ancestor_ids').$type<string[]>().notNull().default([]),
  attributes: jsonb('attributes')
    .$type<{ attributeId: string; name: string; required: boolean; schema: object }[]>()
    .notNull()
    .default([]),
  childCount: integer('child_count').notNull().default(0),
  itemCount: integer('item_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

// --- Item Types ---

export const discoveryItemTypes = pgTable('discovery_item_types', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  widgetSettings: jsonb('widget_settings').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

// --- Owners (organization only) ---

export const discoveryOwners = pgTable('discovery_owners', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  avatarId: text('avatar_id'),
  rating: numeric('rating'),
  reviewCount: integer('review_count').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

// --- User Likes ---

export const discoveryUserLikes = pgTable(
  'discovery_user_likes',
  {
    userId: text('user_id').notNull(),
    itemId: uuid('item_id').notNull(),
    likedAt: timestamp('liked_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.itemId] })],
);

// --- Processed Events (idempotency) ---

export const discoveryProcessedEvents = pgTable('discovery_processed_events', {
  eventId: text('event_id').primaryKey(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

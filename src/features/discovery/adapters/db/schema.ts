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
    imageId: text('image_id'),
    ageGroup: text('age_group'),
    cityId: text('city_id'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    address: text('address'),
    paymentStrategy: text('payment_strategy'),
    price: numeric('price'),
    categoryIds: jsonb('category_ids').$type<string[]>().notNull().default([]),
    attributeValues: jsonb('attribute_values')
      .$type<{ attributeId: string; value: string }[]>()
      .notNull()
      .default([]),
    organizationId: text('organization_id'),
    ownerName: text('owner_name'),
    ownerAvatarId: text('owner_avatar_id'),
    itemRating: numeric('item_rating'),
    itemReviewCount: integer('item_review_count').notNull().default(0),
    ownerRating: numeric('owner_rating'),
    ownerReviewCount: integer('owner_review_count').notNull().default(0),
    eventDates: jsonb('event_dates').$type<string[]>(),
    scheduleEntries:
      jsonb('schedule_entries').$type<
        { dayOfWeek: number; startTime: string; endTime: string }[]
      >(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('discovery_items_city_age_idx').on(table.cityId, table.ageGroup),
    index('discovery_items_org_idx').on(table.organizationId),
    index('discovery_items_price_idx').on(table.price),
    index('discovery_items_rating_idx').on(table.itemRating),
    index('discovery_items_published_at_idx').on(table.publishedAt),
  ],
);

// --- Categories ---

export const discoveryCategories = pgTable('discovery_categories', {
  id: uuid('id').primaryKey(),
  parentCategoryId: text('parent_category_id'),
  name: text('name').notNull(),
  iconId: text('icon_id'),
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
  availableWidgetTypes: jsonb('available_widget_types').$type<string[]>().notNull().default([]),
  requiredWidgetTypes: jsonb('required_widget_types').$type<string[]>().notNull().default([]),
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

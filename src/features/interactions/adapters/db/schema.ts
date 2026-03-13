import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const interactions = pgTable(
  'interactions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    itemId: uuid('item_id').notNull(),
    type: text('type').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('interactions_user_idx').on(table.userId, table.timestamp),
    index('interactions_item_idx').on(table.itemId, table.timestamp),
    index('interactions_type_idx').on(table.type, table.timestamp),
    index('interactions_dedup_idx').on(table.userId, table.itemId, table.type, table.timestamp),
  ],
);

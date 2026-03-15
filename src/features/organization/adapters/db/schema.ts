import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey(),
    state: jsonb('state').notNull(),
    claimToken: text('claim_token'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex('organizations_claim_token_idx').on(table.claimToken)],
);

export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey(),
    organizationId: text('organization_id').notNull(),
    typeId: text('type_id').notNull(),
    state: jsonb('state').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('items_organization_id_idx').on(table.organizationId)],
);

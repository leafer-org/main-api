import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey(),
    boardId: text('board_id').notNull(),
    status: text('status').notNull(),
    assigneeId: text('assignee_id'),
    state: jsonb('state').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('tickets_board_id_idx').on(table.boardId),
    index('tickets_status_idx').on(table.status),
    index('tickets_assignee_id_idx').on(table.assigneeId),
  ],
);

export const boards = pgTable(
  'boards',
  {
    id: uuid('id').primaryKey(),
    scope: text('scope').notNull(),
    state: jsonb('state').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('boards_scope_idx').on(table.scope),
  ],
);

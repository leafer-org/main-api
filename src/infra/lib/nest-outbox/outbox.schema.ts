import { sql } from 'drizzle-orm';
import { customType, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const outboxTable = pgTable('outbox', {
  id: uuid('id').primaryKey().default(sql`uuidv7()`),
  topic: text('topic').notNull(),
  key: text('key'),
  payload: customType<{ data: Buffer }>({
    dataType: () => 'bytea',
  })('payload'),
  headers: jsonb('headers').$type<Record<string, string>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

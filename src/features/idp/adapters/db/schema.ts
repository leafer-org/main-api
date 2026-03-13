import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  permissions: jsonb('permissions').notNull().default({}),
  isStatic: boolean('is_static').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  phoneNumber: text('phone_number').notNull().unique(),
  fullName: text('full_name'),
  role: text('role').notNull().default('USER'),
  avatarFileId: text('avatar_file_id'),
  cityId: text('city_id').notNull().default(''),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const loginProcesses = pgTable(
  'login_processes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').notNull(),
    phoneNumber: text('phone_number').notNull(),
    ip: text('ip'),
    codeHash: text('code_hash'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    attempts: integer('attempts').notNull().default(0),
    lastTryAt: timestamp('last_try_at', { withTimezone: true }),
    registrationSessionId: text('registration_session_id'),
    userId: uuid('user_id'),
    blockedUntil: timestamp('blocked_until', { withTimezone: true }),
    error: text('error'),
  },
  (table) => [
    index('login_processes_phone_ip_requested_idx').on(
      table.phoneNumber,
      table.ip,
      table.requestedAt,
    ),
    index('login_processes_reg_session_idx').on(table.registrationSessionId),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('sessions_user_created_idx').on(table.userId, table.createdAt)],
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type LoginProcess = typeof loginProcesses.$inferSelect;
export type NewLoginProcess = typeof loginProcesses.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type DbRole = typeof roles.$inferSelect;
export type NewDbRole = typeof roles.$inferInsert;

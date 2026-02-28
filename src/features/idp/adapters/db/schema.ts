import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  json,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const mediaVisibilityEnum = pgEnum('media_visibility', ['PUBLIC', 'PRIVATE']);

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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const usersRelations = relations(users, ({ many, one }) => ({
  sessions: many(sessions),
  avatar: one(media, {
    fields: [users.id],
    references: [media.userAvatarId],
  }),
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

export const media = pgTable('media', {
  id: uuid('id').primaryKey().defaultRandom(),
  mediaId: text('media_id').notNull().unique(),
  bucket: text('bucket').notNull(),
  objectKey: text('object_key').notNull(),
  contentType: text('content_type'),
  visibility: mediaVisibilityEnum('visibility').notNull().default('PUBLIC'),
  metadata: json('metadata'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  userAvatarId: uuid('user_avatar_id')
    .unique()
    .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
});

export const mediaRelations = relations(media, ({ one }) => ({
  userAvatar: one(users, {
    fields: [media.userAvatarId],
    references: [users.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type LoginProcess = typeof loginProcesses.$inferSelect;
export type NewLoginProcess = typeof loginProcesses.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;

export type DbRole = typeof roles.$inferSelect;
export type NewDbRole = typeof roles.$inferInsert;

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

export {
  ADMIN_PHONE,
  seedAdminUser,
  seedCities,
  seedStaticRoles,
  truncateAll,
} from '../../../../scripts/seeds.js';

export async function runMigrations(connectionUri: string) {
  const pool = new pg.Pool({ connectionString: connectionUri });

  const db = drizzle({ client: pool });

  await migrate(db, { migrationsFolder: './drizzle' });

  // Expression-индексы drizzle-kit не генерирует, добавляем вручную.
  // Используется для полнотекстового поиска по сообщениям (chat-search).
  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_messages_search_idx
    ON chat_messages
    USING GIN (to_tsvector('russian', coalesce(text, '')))
    WHERE deleted_at IS NULL AND kind <> 'system'
  `);

  await pool.end();
}

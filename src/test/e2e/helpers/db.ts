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
  await pool.end();
}

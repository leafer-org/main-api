import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

export async function runMigrations(connectionUri: string) {
  const pool = new pg.Pool({ connectionString: connectionUri });
  const db = drizzle({ client: pool });

  await migrate(db, { migrationsFolder: './drizzle' });
  await pool.end();
}

export async function truncateAll(connectionUri: string) {
  const client = new pg.Client({ connectionString: connectionUri });
  await client.connect();

  await client.query(`
    DO $$ DECLARE
      r RECORD;
    BEGIN
      FOR r IN (
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename != '__drizzle_migrations'
      ) LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `);

  await client.end();
}

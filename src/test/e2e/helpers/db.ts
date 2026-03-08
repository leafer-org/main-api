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

export const ADMIN_PHONE = '79990000001';

export async function seedStaticRoles(connectionUri: string) {
  const client = new pg.Client({ connectionString: connectionUri });
  await client.connect();

  await client.query(`
    INSERT INTO roles (name, permissions, is_static) VALUES
      ('ADMIN', '{"ROLE.MANAGE": true, "USER.MANAGE": true, "SESSION.MANAGE": "all", "CMS.MANAGE": true}', true),
      ('USER', '{}', true)
    ON CONFLICT (name) DO NOTHING;
  `);

  await client.end();
}

export async function seedAdminUser(connectionUri: string) {
  const client = new pg.Client({ connectionString: connectionUri });
  await client.connect();

  await client.query(
    `
    INSERT INTO users (phone_number, full_name, role) VALUES
      ($1, 'Admin User', 'ADMIN')
    ON CONFLICT (phone_number) DO NOTHING;
  `,
    [ADMIN_PHONE],
  );

  await client.end();
}

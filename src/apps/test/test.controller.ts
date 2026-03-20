import { Controller, HttpCode, Post } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { cmsCities } from '@/features/cms/adapters/db/schema.js';
import { roles, users } from '@/features/idp/adapters/db/schema.js';
import { ConnectionPool } from '@/infra/lib/nest-drizzle/index.js';
import { ADMIN_PHONE, CITIES, STATIC_ROLES } from './test.seeds.js';

@Controller('test')
export class TestController {
  public constructor(private readonly pool: ConnectionPool) {}

  @Post('reset')
  @HttpCode(204)
  public async reset(): Promise<void> {
    const tables = await this.pool.db.execute<{ tablename: string }>(
      sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );

    const tableNames = tables.rows
      .map((r) => r.tablename)
      .filter((name) => !name.startsWith('__'));

    if (tableNames.length === 0) return;

    await this.pool.db.execute(
      sql.raw(`TRUNCATE TABLE ${tableNames.map((t) => `"${t}"`).join(', ')} CASCADE`),
    );
  }

  @Post('seed')
  @HttpCode(204)
  public async seed(): Promise<void> {
    const { db } = this.pool;

    await db.insert(roles).values(STATIC_ROLES).onConflictDoNothing({ target: roles.name });

    await db
      .insert(users)
      .values({ phoneNumber: ADMIN_PHONE, fullName: 'Admin User', role: 'ADMIN' })
      .onConflictDoNothing({ target: users.phoneNumber });

    await db
      .insert(cmsCities)
      .values([...CITIES])
      .onConflictDoUpdate({
        target: cmsCities.id,
        set: {
          name: sql`excluded.name`,
          lat: sql`excluded.lat`,
          lng: sql`excluded.lng`,
        },
      });
  }
}

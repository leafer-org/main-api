import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { type DbModuleOptions, MODULE_OPTIONS_TOKEN } from './database-module.js';

@Injectable()
export class ConnectionPool implements OnModuleDestroy {
  readonly pool: pg.Pool;
  readonly db: NodePgDatabase<Record<string, never>>;

  public constructor(
    @Inject(MODULE_OPTIONS_TOKEN)
    config: DbModuleOptions,
  ) {
    this.pool = new pg.Pool({
      connectionString: config.connection,
      ...config.pool,
    });

    this.db = drizzle({
      client: this.pool,
      casing: config.casing ?? 'snake_case',
    });
  }

  public async onModuleDestroy() {
    await this.pool.end();
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      return true;
    } catch {
      return false;
    }
  }
}

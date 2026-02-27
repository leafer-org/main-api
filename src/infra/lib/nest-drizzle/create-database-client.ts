import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { type DbModuleOptions, MODULE_OPTIONS_TOKEN } from './database-module.js';

export function CreateDatabaseClient<T extends Record<string, unknown>>(schema: T) {
  @Injectable()
  class DatabaseClient implements OnModuleDestroy {
    readonly #pool: pg.Pool;
    public readonly db: NodePgDatabase<T>;

    public constructor(
      @Inject(MODULE_OPTIONS_TOKEN)
      config: DbModuleOptions,
    ) {
      this.#pool = new pg.Pool({
        connectionString: config.connection,
        ...config.pool,
      });

      this.db = drizzle({
        client: this.#pool,
        casing: config.casing ?? 'snake_case',
        schema,
      });
    }

    public async onModuleDestroy() {
      await this.#pool.end();
    }

    public async healthCheck() {
      try {
        const client = await this.#pool.connect();
        await client.query('SELECT 1');
        client.release();
        return true;
      } catch {
        return false;
      }
    }

    public get transaction() {
      return this.db.transaction.bind(this.db);
    }

    public get query() {
      return this.db.query;
    }

    public get count() {
      return this.db.$count.bind(this.db);
    }

    public get select() {
      return this.db.select.bind(this.db);
    }

    public get selectDistinct() {
      return this.db.selectDistinct.bind(this.db);
    }

    public get selectDistinctOn() {
      return this.db.selectDistinctOn.bind(this.db);
    }

    public get insert() {
      return this.db.insert.bind(this.db);
    }

    public get update() {
      return this.db.update.bind(this.db);
    }

    public get delete() {
      return this.db.delete.bind(this.db);
    }

    public get execute() {
      return this.db.execute.bind(this.db);
    }
  }

  return DatabaseClient;
}

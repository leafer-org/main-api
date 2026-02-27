import { ConfigurableModuleBuilder, Module } from '@nestjs/common';

import { ConnectionPool } from './connection-pool.js';
import type { CreateDatabaseClient } from './create-database-client.js';

export type DbCasing = 'snake_case' | 'camelCase';

export type DbPoolConfig = {
  max?: number;
  min?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  allowExitOnIdle?: boolean;
};

export type DbModuleOptions = {
  connection: string;
  casing?: DbCasing;
  pool?: DbPoolConfig;
};

const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<DbModuleOptions>()
    .setExtras(
      {
        isGlobal: false,
        clients: [] as ReturnType<typeof CreateDatabaseClient>[],
      },
      (definition, extras) => {
        const providers = [...(definition.providers ?? []), ConnectionPool];
        const exports = [...(definition.exports ?? []), ConnectionPool];

        for (const client of extras.clients) {
          providers.push(client);
          exports.push(client);
        }

        return { ...definition, providers, exports, global: extras.isGlobal };
      },
    )
    .build();

export { MODULE_OPTIONS_TOKEN };

@Module({})
export class DatabaseModule extends ConfigurableModuleClass {}

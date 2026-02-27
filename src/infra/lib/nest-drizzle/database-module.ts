import { ConfigurableModuleBuilder, Module } from '@nestjs/common';

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
        DatabaseClient: null as ReturnType<typeof CreateDatabaseClient> | null,
      },
      (definition, extras) => {
        const providers = definition.providers ?? [];
        const exports = definition.exports ?? [];

        if (extras.DatabaseClient) {
          providers.push(extras.DatabaseClient);
          exports.push(extras.DatabaseClient);
        }

        return { ...definition, providers, exports, global: extras.isGlobal };
      },
    )
    .build();

export { MODULE_OPTIONS_TOKEN };

@Module({})
export class DatabaseModule extends ConfigurableModuleClass {}

import { Injectable, Module } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { integer, pgTable, varchar } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it } from 'vitest';

import { CreateDatabaseClient } from './create-database-client.js';
import { DatabaseModule } from './database-module.js';

// biome-ignore lint/security/noSecrets: test credentials
const TEST_CONNECTION = 'postgres://postgres:postgres@localhost:5432/postgres';

describe('DatabaseModule', () => {
  beforeEach(async () => {});

  it('should provide custom database client', async () => {
    const usersTable = pgTable('users', {
      id: integer().primaryKey().generatedAlwaysAsIdentity(),
      name: varchar().notNull(),
      age: integer().notNull(),
      email: varchar().notNull().unique(),
    });

    const schema = { usersTable };

    @Injectable()
    class MainDatabaseClient extends CreateDatabaseClient(schema) {}

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        DatabaseModule.register({
          connection: TEST_CONNECTION,
          DatabaseClient: MainDatabaseClient,
        }),
      ],
    }).compile();

    const client = module.get(MainDatabaseClient);

    client.query.usersTable.findMany();

    expect(client).toBeDefined();
  });

  it('should provide config to factory', async () => {
    const usersTable = pgTable('users', {
      id: integer().primaryKey().generatedAlwaysAsIdentity(),
      name: varchar().notNull(),
    });

    const schema = { usersTable };

    @Injectable()
    class MainDatabaseClient extends CreateDatabaseClient(schema) {}

    @Injectable()
    class ConfigService {
      public getConnectionUrl() {
        return TEST_CONNECTION;
      }
    }

    @Module({ providers: [ConfigService], exports: [ConfigService] })
    class ConfigModule {}

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        DatabaseModule.registerAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({ connection: config.getConnectionUrl() }),
          DatabaseClient: MainDatabaseClient,
        }),
      ],
    }).compile();

    const client = module.get(MainDatabaseClient);

    expect(client).toBeDefined();
  });
});

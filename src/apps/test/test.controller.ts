import { Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { sql } from 'drizzle-orm';

import { cmsCities } from '@/features/cms/adapters/db/schema.js';
import { roles, users } from '@/features/idp/adapters/db/schema.js';
import { ConnectionPool } from '@/infra/lib/nest-drizzle/index.js';
import { KafkaConsumerService } from '@/infra/lib/nest-kafka/consumer/kafka-consumer.service.js';
import { KafkaProducerService } from '@/infra/lib/nest-kafka/producer/kafka-producer.service.js';
import { OutboxRelayService } from '@/infra/lib/nest-outbox/outbox-relay.service.js';
import { ADMIN_PHONE, CITIES, STATIC_ROLES } from './test.seeds.js';

@Controller('test')
export class TestController {
  private readonly logger = new Logger(TestController.name);

  public constructor(
    private readonly pool: ConnectionPool,
    private readonly modulesContainer: ModulesContainer,
  ) {}

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

  @Post('flush-outbox')
  @HttpCode(204)
  public async flushOutbox(): Promise<void> {
    const relay = this.resolveProvider(OutboxRelayService);
    const producer = this.resolveProvider(KafkaProducerService);

    if (relay) await relay.flush();
    if (producer) await producer.flush();
  }

  @Post('wait-consumers')
  @HttpCode(204)
  public async waitConsumers(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [, mod] of this.modulesContainer) {
      const wrapper = mod.providers?.get(KafkaConsumerService);
      if (wrapper?.instance && wrapper.instance instanceof KafkaConsumerService) {
        promises.push(wrapper.instance.waitForPartitions());
      }
    }

    this.logger.log(`Waiting for ${promises.length} consumers...`);
    await Promise.all(promises);
    this.logger.log('All consumers ready');
  }

  // biome-ignore lint/suspicious/noExplicitAny: accessing internal NestJS container
  private resolveProvider<T>(token: abstract new (...args: any[]) => T): T | null {
    for (const [, mod] of this.modulesContainer) {
      const wrapper = mod.providers?.get(token);
      if (wrapper?.instance) return wrapper.instance as T;
    }
    return null;
  }
}

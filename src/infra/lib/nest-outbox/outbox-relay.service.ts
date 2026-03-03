import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { asc, inArray } from 'drizzle-orm';

import { ConnectionPool } from '../nest-drizzle/connection-pool.js';
import { KafkaProducerService } from '../nest-kafka/producer/kafka-producer.service.js';
import { outboxTable } from './outbox.schema.js';

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_BATCH_SIZE = 100;

export type OutboxRelayOptions = {
  pollIntervalMs?: number;
  batchSize?: number;
};

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private pollPromise: Promise<void> | null = null;

  private readonly pollIntervalMs: number;
  private readonly batchSize: number;

  public constructor(
    private readonly db: ConnectionPool,
    private readonly producer: KafkaProducerService,
  ) {
    this.pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
    this.batchSize = DEFAULT_BATCH_SIZE;
  }

  public onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
    this.logger.log(`Outbox relay started (interval=${this.pollIntervalMs}ms)`);
  }

  public onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.logger.log('Outbox relay stopped');
  }

  public async poll(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const work = this.doPoll();
    this.pollPromise = work;
    await work;
  }

  public async flush(): Promise<void> {
    if (this.pollPromise !== null) {
      await this.pollPromise;
    }
    await this.poll();
    await this.producer.flush();
  }

  private async doPoll(): Promise<void> {
    try {
      await this.db.db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(outboxTable)
          .orderBy(asc(outboxTable.id))
          .limit(this.batchSize)
          .for('update', { skipLocked: true });

        if (rows.length === 0) return;

        for (const row of rows) {
          if (!row.payload) continue;

          this.producer.sendRaw(row.topic, row.payload, {
            key: row.key ?? undefined,
            headers: row.headers ?? undefined,
          });
        }

        const ids = rows.map((r) => r.id);
        await tx.delete(outboxTable).where(inArray(outboxTable.id, ids));
      });
    } catch (error) {
      this.logger.error('Outbox relay poll failed', error);
    } finally {
      this.running = false;
      this.pollPromise = null;
    }
  }
}

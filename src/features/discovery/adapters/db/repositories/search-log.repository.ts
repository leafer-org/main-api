import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { SearchLogPort } from '../../../application/ports.js';
import { discoverySearchLog } from '../schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';

@Injectable()
export class DrizzleSearchLogRepository implements SearchLogPort {
  public constructor(private readonly txHost: TransactionHostPg) {}

  public async logQuery(tx: Transaction, cityId: string, query: string): Promise<void> {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) return;

    const db = this.txHost.get(tx);

    await db
      .insert(discoverySearchLog)
      .values({ cityId, query: normalized, count: 1, lastUsedAt: new Date() })
      .onConflictDoUpdate({
        target: [discoverySearchLog.cityId, discoverySearchLog.query],
        set: {
          count: sql`${discoverySearchLog.count} + 1`,
          lastUsedAt: new Date(),
        },
      });
  }
}

import { Injectable } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';

import { SessionRepository } from '../../application/ports.js';
import type { SessionState } from '../../domain/aggregates/session/state.js';
import { sessions } from './schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import { SessionId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleSessionRepository extends SessionRepository {
  public constructor(private readonly txHost: TransactionHostPg) {
    super();
  }

  public async findById(tx: Transaction, sessionId: SessionId): Promise<SessionState | null> {
    const db = this.txHost.get(tx);
    const rows = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
    const row = rows[0];
    if (!row) return null;

    return {
      id: SessionId.raw(row.id),
      userId: UserId.raw(row.userId),
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    };
  }

  public async save(tx: Transaction, state: SessionState): Promise<void> {
    const db = this.txHost.get(tx);
    await db
      .insert(sessions)
      .values({
        id: state.id,
        userId: state.userId,
        createdAt: state.createdAt,
        expiresAt: state.expiresAt,
      })
      .onConflictDoUpdate({
        target: sessions.id,
        set: {
          userId: state.userId,
          expiresAt: state.expiresAt,
        },
      });
  }

  public async deleteById(tx: Transaction, sessionId: SessionId): Promise<void> {
    const db = this.txHost.get(tx);
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  }

  public async deleteAllByUserIdExcept(
    tx: Transaction,
    userId: UserId,
    excludeSessionId: SessionId,
  ): Promise<void> {
    const db = this.txHost.get(tx);
    await db
      .delete(sessions)
      .where(and(eq(sessions.userId, userId), ne(sessions.id, excludeSessionId)));
  }
}

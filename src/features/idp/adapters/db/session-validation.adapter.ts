import { Injectable } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';

import { sessions } from './schema.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { SessionValidationPort } from '@/kernel/application/ports/session-validation.js';
import type { Transaction } from '@/kernel/application/ports/tx-host.js';
import type { SessionId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleSessionValidation extends SessionValidationPort {
  public constructor(private readonly txHost: TransactionHostPg) {
    super();
  }

  public async exists(tx: Transaction, sessionId: SessionId): Promise<boolean> {
    const db = this.txHost.get(tx);
    const rows = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
      .limit(1);

    return rows.length > 0;
  }
}

import { Inject, Injectable } from '@nestjs/common';

import { IdempotencyPort } from '../../projection-ports.js';
import { GorseSyncPort } from '../../sync-ports.js';
import type { UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class ProjectUserHandler {
  public constructor(
    @Inject(IdempotencyPort) private readonly idempotency: IdempotencyPort,
    @Inject(GorseSyncPort) private readonly gorse: GorseSyncPort,
  ) {}

  public async handleUserEvent(
    eventId: string,
    payload: { userId: UserId; role: string; fullName: string },
  ): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    const labels = [`role:${payload.role}`];
    await this.gorse.upsertUser(payload.userId, labels, payload.fullName);

    await this.idempotency.markProcessed(eventId);
  }
}

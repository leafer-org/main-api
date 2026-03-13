import { Inject, Injectable } from '@nestjs/common';

import { IdempotencyPort } from '../../projection-ports.js';
import { GorseSyncPort } from '../../sync-ports.js';
import { h3Labels } from '@/infra/lib/geo/h3-geo.js';
import type { UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class ProjectUserHandler {
  public constructor(
    @Inject(IdempotencyPort) private readonly idempotency: IdempotencyPort,
    @Inject(GorseSyncPort) private readonly gorse: GorseSyncPort,
  ) {}

  public async handleUserEvent(
    eventId: string,
    payload: { userId: UserId; fullName: string; lat?: number; lng?: number },
  ): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    const labels =
      payload.lat !== undefined && payload.lng !== undefined
        ? h3Labels(payload.lat, payload.lng)
        : [];
    await this.gorse.upsertUser(payload.userId, labels, payload.fullName);

    await this.idempotency.markProcessed(eventId);
  }
}

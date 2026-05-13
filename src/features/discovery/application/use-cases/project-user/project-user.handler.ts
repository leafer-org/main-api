import { Inject, Injectable } from '@nestjs/common';

import { IdempotencyPort } from '../../projection-ports.js';
import { GorseSyncPort } from '../../sync-ports.js';
import { h3Labels } from '@/infra/lib/geo/h3-geo.js';
import { UserDirectoryPort } from '@/kernel/application/ports/user-directory.js';
import type { UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class ProjectUserHandler {
  public constructor(
    @Inject(IdempotencyPort) private readonly idempotency: IdempotencyPort,
    @Inject(GorseSyncPort) private readonly gorse: GorseSyncPort,
    @Inject(UserDirectoryPort) private readonly userDirectory: UserDirectoryPort,
  ) {}

  public async handleUserEvent(eventId: string, payload: { userId: UserId }): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    const user = await this.userDirectory.findById(payload.userId);
    if (!user) {
      await this.idempotency.markProcessed(eventId);
      return;
    }

    const labels =
      user.lat !== null && user.lng !== null ? h3Labels(user.lat, user.lng) : [];
    await this.gorse.upsertUser(user.userId, labels, user.fullName);

    await this.idempotency.markProcessed(eventId);
  }
}

import { Inject, Injectable } from '@nestjs/common';

import type { InteractionRecordedEvent } from '@/kernel/domain/events/interaction.events.js';

import { IdempotencyPort } from '../../projection-ports.js';
import { GorseSyncPort } from '../../sync-ports.js';

/**
 * interaction.recorded → feedback в Gorse. unlike → удаляет feedback 'like'.
 * Веса: view=1, click=2, like=4, purchase/booking=8.
 */
@Injectable()
export class ProjectInteractionHandler {
  public constructor(
    @Inject(IdempotencyPort) private readonly idempotency: IdempotencyPort,
    @Inject(GorseSyncPort) private readonly gorse: GorseSyncPort,
  ) {}

  public async handleInteractionRecorded(
    eventId: string,
    payload: InteractionRecordedEvent,
  ): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    if (payload.interactionType === 'unlike') {
      await this.gorse.deleteFeedback(payload.userId, payload.itemId, 'like');
    } else {
      await this.gorse.sendFeedback(
        payload.userId,
        payload.itemId,
        payload.interactionType,
        payload.timestamp,
      );
    }

    await this.idempotency.markProcessed(eventId);
  }
}

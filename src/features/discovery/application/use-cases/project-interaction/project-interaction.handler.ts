import { Inject, Injectable } from '@nestjs/common';

import type { InteractionRecordedEvent } from '@/kernel/domain/events/interaction.events.js';

import { IdempotencyPort, UserLikeProjectionPort } from '../../projection-ports.js';
import { GorseSyncPort } from '../../sync-ports.js';

@Injectable()
export class ProjectInteractionHandler {
  public constructor(
    @Inject(IdempotencyPort) private readonly idempotency: IdempotencyPort,
    @Inject(GorseSyncPort) private readonly gorse: GorseSyncPort,
    @Inject(UserLikeProjectionPort) private readonly userLikeProjection: UserLikeProjectionPort,
  ) {}

  public async handleInteractionRecorded(
    eventId: string,
    payload: InteractionRecordedEvent,
  ): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    if (payload.interactionType === 'unlike') {
      await this.userLikeProjection.removeLike(payload.userId, payload.itemId);
      await this.gorse.deleteFeedback(payload.userId, payload.itemId, 'like');
    } else {
      await this.gorse.sendFeedback(
        payload.userId,
        payload.itemId,
        payload.interactionType,
        payload.timestamp,
      );

      if (payload.interactionType === 'like') {
        await this.userLikeProjection.saveLike(payload.userId, payload.itemId, payload.timestamp);
      }
    }

    await this.idempotency.markProcessed(eventId);
  }
}

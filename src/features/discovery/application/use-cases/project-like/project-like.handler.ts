import { Inject, Injectable } from '@nestjs/common';

import type { ItemLikedEvent, ItemUnlikedEvent } from '@/kernel/domain/events/like.events.js';

import { IdempotencyPort, UserLikeProjectionPort } from '../../projection-ports.js';

/**
 * item.liked / item.unliked из топика like.streaming → PG (user_likes).
 * Отделён от interaction.streaming для надёжной проекции лайков.
 */
@Injectable()
export class ProjectLikeHandler {
  public constructor(
    @Inject(IdempotencyPort) private readonly idempotency: IdempotencyPort,
    @Inject(UserLikeProjectionPort) private readonly userLikeProjection: UserLikeProjectionPort,
  ) {}

  public async handleItemLiked(eventId: string, payload: ItemLikedEvent): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    await this.userLikeProjection.saveLike(payload.userId, payload.itemId, payload.timestamp);
    await this.idempotency.markProcessed(eventId);
  }

  public async handleItemUnliked(eventId: string, payload: ItemUnlikedEvent): Promise<void> {
    if (await this.idempotency.isProcessed(eventId)) return;

    await this.userLikeProjection.removeLike(payload.userId, payload.itemId);
    await this.idempotency.markProcessed(eventId);
  }
}

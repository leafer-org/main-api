import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';

import { InteractionPublisherPort, InteractionWritePort } from '../../ports.js';
import type { InteractionType } from '@/kernel/domain/events/interaction.events.js';
import type { ItemId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class ConsumeLikeHandler {
  public constructor(
    @Inject(InteractionWritePort) private readonly write: InteractionWritePort,
    @Inject(InteractionPublisherPort) private readonly publisher: InteractionPublisherPort,
  ) {}

  public async handleLiked(params: {
    userId: UserId;
    itemId: ItemId;
    timestamp: Date;
  }): Promise<void> {
    await this.record(params.userId, params.itemId, 'like', params.timestamp);
  }

  public async handleUnliked(params: {
    userId: UserId;
    itemId: ItemId;
    timestamp: Date;
  }): Promise<void> {
    await this.record(params.userId, params.itemId, 'unlike', params.timestamp);
  }

  private async record(
    userId: UserId,
    itemId: ItemId,
    type: InteractionType,
    timestamp: Date,
  ): Promise<void> {
    const id = uuidv7();

    await this.write.insert({ id, userId, itemId, type, timestamp });

    this.publisher.publish({
      id,
      userId,
      itemId,
      interactionType: type,
      timestamp,
    });
  }
}

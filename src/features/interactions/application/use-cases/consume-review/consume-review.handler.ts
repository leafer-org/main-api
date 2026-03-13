import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';

import { InteractionPublisherPort, InteractionWritePort } from '../../ports.js';
import type { ItemId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class ConsumeReviewHandler {
  public constructor(
    @Inject(InteractionWritePort) private readonly write: InteractionWritePort,
    @Inject(InteractionPublisherPort) private readonly publisher: InteractionPublisherPort,
  ) {}

  /** Записывает interaction только для review на item (не organization). */
  public async handleReviewCreated(params: {
    userId: UserId;
    itemId: ItemId;
    timestamp: Date;
  }): Promise<void> {
    const id = uuidv7();

    await this.write.insert({
      id,
      userId: params.userId,
      itemId: params.itemId,
      type: 'review',
      timestamp: params.timestamp,
    });

    this.publisher.publish({
      id,
      userId: params.userId,
      itemId: params.itemId,
      interactionType: 'review',
      timestamp: params.timestamp,
    });
  }
}

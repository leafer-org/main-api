import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';

import { InteractionPublisherPort, InteractionWritePort } from '../../ports.js';
import { Clock } from '@/infra/lib/clock.js';
import type { InteractionType } from '@/kernel/domain/events/interaction.events.js';
import type { ItemId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class RecordInteractionInteractor {
  public constructor(
    @Inject(Clock) private readonly clock: Clock,
    @Inject(InteractionWritePort) private readonly write: InteractionWritePort,
    @Inject(InteractionPublisherPort) private readonly publisher: InteractionPublisherPort,
  ) {}

  public async execute(command: {
    userId: UserId;
    itemId: ItemId;
    type: InteractionType;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const id = uuidv7();
    const now = this.clock.now();

    await this.write.insert({
      id,
      userId: command.userId,
      itemId: command.itemId,
      type: command.type,
      metadata: command.metadata,
      timestamp: now,
    });

    this.publisher.publish({
      id,
      userId: command.userId,
      itemId: command.itemId,
      interactionType: command.type,
      metadata: command.metadata,
      timestamp: now,
    });
  }
}

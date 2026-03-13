import { Inject, Injectable, Logger } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';

import { InteractionDedupPort, InteractionPublisherPort, InteractionWritePort } from '../../ports.js';
import { Clock } from '@/infra/lib/clock.js';
import type { ItemId, UserId } from '@/kernel/domain/ids.js';

const ONE_HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class RecordViewsInteractor {
  private readonly logger = new Logger(RecordViewsInteractor.name);

  public constructor(
    @Inject(Clock) private readonly clock: Clock,
    @Inject(InteractionWritePort) private readonly write: InteractionWritePort,
    @Inject(InteractionDedupPort) private readonly dedup: InteractionDedupPort,
    @Inject(InteractionPublisherPort) private readonly publisher: InteractionPublisherPort,
  ) {}

  public async execute(command: { userId: UserId; itemIds: ItemId[] }): Promise<void> {
    const recentlyViewed = await this.dedup.filterRecentlyViewed(
      command.userId,
      command.itemIds,
      ONE_HOUR_MS,
    );

    const recentSet = new Set(recentlyViewed.map(String));
    const newItemIds = command.itemIds.filter((id) => !recentSet.has(String(id)));

    if (newItemIds.length === 0) return;

    const now = this.clock.now();
    const rows = newItemIds.map((itemId) => ({
      id: uuidv7(),
      userId: command.userId,
      itemId,
      type: 'view' as const,
      timestamp: now,
    }));

    await this.write.insertBatch(rows);

    this.publisher.publishBatch(
      rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        itemId: r.itemId,
        interactionType: r.type,
        timestamp: r.timestamp,
      })),
    );
  }
}

import { Injectable } from '@nestjs/common';
import { and, eq, gt, inArray } from 'drizzle-orm';

import { InteractionDedupPort, InteractionWritePort } from '../../application/ports.js';
import { InteractionDatabaseClient } from './client.js';
import { interactions } from './schema.js';
import type { InteractionType } from '@/kernel/domain/events/interaction.events.js';
import type { ItemId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleInteractionWriteRepository implements InteractionWritePort {
  public constructor(private readonly db: InteractionDatabaseClient) {}

  public async insert(params: {
    id: string;
    userId: UserId;
    itemId: ItemId;
    type: InteractionType;
    metadata?: Record<string, unknown>;
    timestamp: Date;
  }): Promise<void> {
    await this.db.insert(interactions).values({
      id: params.id,
      userId: params.userId as string,
      itemId: params.itemId as string,
      type: params.type,
      metadata: params.metadata ?? null,
      timestamp: params.timestamp,
    });
  }

  public async insertBatch(
    rows: {
      id: string;
      userId: UserId;
      itemId: ItemId;
      type: InteractionType;
      timestamp: Date;
    }[],
  ): Promise<void> {
    if (rows.length === 0) return;

    await this.db.insert(interactions).values(
      rows.map((r) => ({
        id: r.id,
        userId: r.userId as string,
        itemId: r.itemId as string,
        type: r.type,
        timestamp: r.timestamp,
      })),
    );
  }
}

@Injectable()
export class DrizzleInteractionDedupRepository implements InteractionDedupPort {
  public constructor(private readonly db: InteractionDatabaseClient) {}

  /** Возвращает itemIds, для которых УЖЕ есть view за последние withinMs мс. */
  public async filterRecentlyViewed(
    userId: UserId,
    itemIds: ItemId[],
    withinMs: number,
  ): Promise<ItemId[]> {
    if (itemIds.length === 0) return [];

    const since = new Date(Date.now() - withinMs);

    const rows = await this.db
      .selectDistinct({ itemId: interactions.itemId })
      .from(interactions)
      .where(
        and(
          eq(interactions.userId, userId as string),
          inArray(interactions.itemId, itemIds as string[]),
          eq(interactions.type, 'view'),
          gt(interactions.timestamp, since),
        ),
      );

    return rows.map((r) => r.itemId as ItemId);
  }
}

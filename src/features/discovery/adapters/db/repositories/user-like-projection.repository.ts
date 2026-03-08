import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { UserLikeProjectionPort } from '../../../application/projection-ports.js';
import { DiscoveryDatabaseClient } from '../client.js';
import { discoveryUserLikes } from '../schema.js';
import type { ItemId, UserId } from '@/kernel/domain/ids.js';

@Injectable()
export class DrizzleUserLikeProjectionRepository implements UserLikeProjectionPort {
  public constructor(private readonly dbClient: DiscoveryDatabaseClient) {}

  public async saveLike(userId: UserId, itemId: ItemId, likedAt: Date): Promise<void> {
    await this.dbClient.db
      .insert(discoveryUserLikes)
      .values({
        userId: userId as string,
        itemId: itemId as string,
        likedAt,
      })
      .onConflictDoNothing();
  }

  public async removeLike(userId: UserId, itemId: ItemId): Promise<void> {
    await this.dbClient.db
      .delete(discoveryUserLikes)
      .where(
        and(
          eq(discoveryUserLikes.userId, userId as string),
          eq(discoveryUserLikes.itemId, itemId as string),
        ),
      );
  }
}

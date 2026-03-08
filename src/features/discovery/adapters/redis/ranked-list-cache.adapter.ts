import { Inject, Injectable } from '@nestjs/common';

import { RankedListCachePort } from '../../application/ports.js';
import type { ItemId } from '@/kernel/domain/ids.js';
import { RedisConnection } from '@/infra/lib/nest-redis/index.js';

@Injectable()
export class RedisRankedListCache implements RankedListCachePort {
  public constructor(
    @Inject(RedisConnection) private readonly redisConnection: RedisConnection,
  ) {}

  public async get(key: string): Promise<ItemId[] | null> {
    const value = await this.redisConnection.redis.get(key);
    if (value == null) return null;
    return JSON.parse(value) as ItemId[];
  }

  public async set(key: string, itemIds: ItemId[], ttlMs: number): Promise<void> {
    await this.redisConnection.redis.set(key, JSON.stringify(itemIds), 'PX', ttlMs);
  }
}

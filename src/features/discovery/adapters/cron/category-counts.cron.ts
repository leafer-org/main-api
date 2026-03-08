import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { RedisConnection } from '@/infra/lib/nest-redis/index.js';

import { CategoryProjectionPort } from '../../application/projection-ports.js';

const LOCK_KEY = 'discovery:category-counts:lock';
const LOCK_TTL_SECONDS = 30 * 60;

@Injectable()
export class CategoryCountsCron {
  public constructor(
    @Inject(CategoryProjectionPort) private readonly categoryProjection: CategoryProjectionPort,
    @Inject(RedisConnection) private readonly redisConnection: RedisConnection,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  public async recalcCounts(): Promise<void> {
    const acquired = await this.redisConnection.redis.set(LOCK_KEY, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
    if (acquired === null) return;

    try {
      await this.categoryProjection.recalcAllCounts();
    } finally {
      await this.redisConnection.redis.del(LOCK_KEY);
    }
  }
}

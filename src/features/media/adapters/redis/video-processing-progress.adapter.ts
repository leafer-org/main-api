import { Inject, Injectable } from '@nestjs/common';

import { VideoProcessingProgress } from '../../application/ports.js';
import { RedisConnection } from '@/infra/lib/nest-redis/redis-connection.js';
import type { MediaId } from '@/kernel/domain/ids.js';

const KEY_PREFIX = 'video-progress:';
const TTL_SECONDS = 3600; // 1 hour

@Injectable()
export class RedisVideoProcessingProgress implements VideoProcessingProgress {
  public constructor(
    @Inject(RedisConnection) private readonly conn: RedisConnection,
  ) {}

  public async set(mediaId: MediaId, percent: number): Promise<void> {
    await this.conn.redis.set(`${KEY_PREFIX}${mediaId}`, percent, 'EX', TTL_SECONDS);
  }

  public async get(mediaId: MediaId): Promise<number | null> {
    const value = await this.conn.redis.get(`${KEY_PREFIX}${mediaId}`);
    return value !== null ? Number(value) : null;
  }

  public async delete(mediaId: MediaId): Promise<void> {
    await this.conn.redis.del(`${KEY_PREFIX}${mediaId}`);
  }
}

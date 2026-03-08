import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

import { MODULE_OPTIONS_TOKEN, type RedisModuleOptions } from './tokens.js';

@Injectable()
export class RedisConnection implements OnModuleDestroy {
  public readonly redis: Redis;

  public constructor(
    @Inject(MODULE_OPTIONS_TOKEN)
    config: RedisModuleOptions,
  ) {
    this.redis = new Redis(config.url);
  }

  public async onModuleDestroy() {
    await this.redis.quit();
  }
}

import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

import { MODULE_OPTIONS_TOKEN, type RedisModuleOptions } from './tokens.js';

@Injectable()
export class RedisConnection implements OnModuleDestroy {
  public readonly redis: Redis;
  private readonly subscribers = new Set<Redis>();

  public constructor(
    @Inject(MODULE_OPTIONS_TOKEN)
    private readonly config: RedisModuleOptions,
  ) {
    this.redis = new Redis(config.url);
  }

  // Отдельная коннекция для subscribe/psubscribe — Redis-протокол не позволяет
  // выполнять обычные команды на коннекции в subscribe-mode.
  public createSubscriber(): Redis {
    const sub = new Redis(this.config.url);
    this.subscribers.add(sub);
    return sub;
  }

  public async onModuleDestroy() {
    await Promise.all([...this.subscribers].map((s) => s.quit()));
    this.subscribers.clear();
    await this.redis.quit();
  }
}

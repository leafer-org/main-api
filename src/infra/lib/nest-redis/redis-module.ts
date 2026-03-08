import { Module } from '@nestjs/common';

import { RedisConnection } from './redis-connection.js';
import { ConfigurableModuleClass } from './tokens.js';

export type { RedisModuleOptions } from './tokens.js';

@Module({
  providers: [RedisConnection],
  exports: [RedisConnection],
})
export class RedisModule extends ConfigurableModuleClass {}

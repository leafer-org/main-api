import { Global, Module } from '@nestjs/common';

import { MainConfigModule } from '@/infra/config/module.js';
import { MainConfigService } from '@/infra/config/service.js';
import { RedisModule } from '@/infra/lib/nest-redis/index.js';

@Global()
@Module({
  imports: [
    RedisModule.registerAsync({
      imports: [MainConfigModule],
      useFactory: (config: MainConfigService) => ({
        url: config.get('REDIS_URL'),
      }),
      inject: [MainConfigService],
    }),
  ],
  exports: [RedisModule],
})
export class MainRedisModule {}

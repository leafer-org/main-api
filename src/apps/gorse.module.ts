import { Global, Module } from '@nestjs/common';

import { MainConfigModule } from '@/infra/config/module.js';
import { MainConfigService } from '@/infra/config/service.js';
import { GorseModule } from '@/infra/lib/nest-gorse/index.js';

@Global()
@Module({
  imports: [
    GorseModule.registerAsync({
      imports: [MainConfigModule],
      useFactory: (config: MainConfigService) => ({
        url: config.get('GORSE_URL'),
        apiKey: config.get('GORSE_API_KEY'),
      }),
      inject: [MainConfigService],
    }),
  ],
  exports: [GorseModule],
})
export class MainGorseModule {}

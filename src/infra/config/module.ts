import { Module } from '@nestjs/common';

import { MainConfigService } from './service.js';
import { ConfigModule } from '@/infra/lib/config/index.js';

@Module({
  imports: [
    ConfigModule.register({
      isGlobal: true,
      ConfigService: MainConfigService,
    }),
  ],
  exports: [ConfigModule],
})
export class MainConfigModule {}

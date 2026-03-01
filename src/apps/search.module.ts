import { Global, Module } from '@nestjs/common';

import { MainConfigModule } from '@/infra/config/module.js';
import { MainConfigService } from '@/infra/config/service.js';
import { SearchModule } from '@/infra/lib/nest-search/index.js';

@Global()
@Module({
  imports: [
    SearchModule.registerAsync({
      clients: [],
      imports: [MainConfigModule],
      useFactory: (config: MainConfigService) => ({
        node: config.get('ZINC_URL'),
        username: config.get('ZINC_USER'),
        password: config.get('ZINC_PASSWORD'),
      }),
      inject: [MainConfigService],
    }),
  ],
  exports: [SearchModule],
})
export class MainSearchModule {}

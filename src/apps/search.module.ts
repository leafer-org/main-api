import { Global, Module } from '@nestjs/common';

import { AdminUsersSearchClient } from '../features/idp/adapters/search/admin-users.index.js';
import { MainConfigModule } from '@/infra/config/module.js';
import { MainConfigService } from '@/infra/config/service.js';
import { SearchModule } from '@/infra/lib/nest-search/index.js';

@Global()
@Module({
  imports: [
    SearchModule.registerAsync({
      clients: [AdminUsersSearchClient],
      imports: [MainConfigModule],
      useFactory: (config: MainConfigService) => ({
        host: config.get('MEILI_URL'),
        apiKey: config.get('MEILI_API_KEY'),
      }),
      inject: [MainConfigService],
    }),
  ],
  exports: [SearchModule],
})
export class MainSearchModule {}

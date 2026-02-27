import { Global, Module } from '@nestjs/common';

import { IdpDatabaseClient } from '@/features/idp/adapters/db/client.js';
import { MediaDatabaseClient } from '@/features/media/adapters/db/client.js';
import { MainConfigModule } from '@/infra/config/module.js';
import { MainConfigService } from '@/infra/config/service.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { DatabaseModule } from '@/infra/lib/nest-drizzle/index.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';

@Global()
@Module({
  imports: [
    DatabaseModule.registerAsync({
      clients: [IdpDatabaseClient, MediaDatabaseClient],
      imports: [MainConfigModule],
      useFactory: (config: MainConfigService) => ({
        connection: config.get('DB_URL'),
      }),
      inject: [MainConfigService],
    }),
  ],
  providers: [{ useClass: TransactionHostPg, provide: TransactionHost }],
  exports: [DatabaseModule, TransactionHost],
})
export class MainDbModule {}

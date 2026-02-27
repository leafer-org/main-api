import { Global, Module } from '@nestjs/common';

import { MainConfigModule } from '../config/module.js';
import { MainConfigService } from '../config/service.js';
import { DatabaseClient } from './service.js';
import { TransactionHostPg } from './tx-host-pg.js';
import { DatabaseModule } from '@/infra/lib/nest-drizzle/index.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';

@Global()
@Module({
  imports: [
    DatabaseModule.registerAsync({
      DatabaseClient,
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

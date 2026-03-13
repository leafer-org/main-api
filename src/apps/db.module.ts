import { Global, Module } from '@nestjs/common';

import { DiscoveryDatabaseClient } from '@/features/discovery/adapters/db/client.js';
import { IdpDatabaseClient } from '@/features/idp/adapters/db/client.js';
import { MediaDatabaseClient } from '@/features/media/adapters/db/client.js';
import { OrganizationDatabaseClient } from '@/features/organization/adapters/db/client.js';
import { MainConfigModule } from '@/infra/config/module.js';
import { MainConfigService } from '@/infra/config/service.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { DatabaseModule } from '@/infra/lib/nest-drizzle/index.js';
import { TransactionHost } from '@/kernel/application/ports/tx-host.js';
import { ReviewDatabaseClient } from '@/features/reviews/adapters/db/client.js';
import { InteractionDatabaseClient } from '@/features/interactions/adapters/db/client.js';
import { TicketDatabaseClient } from '@/features/tickets/adapters/db/client.js';

@Global()
@Module({
  imports: [
    DatabaseModule.registerAsync({
      clients: [DiscoveryDatabaseClient, IdpDatabaseClient, MediaDatabaseClient, OrganizationDatabaseClient, ReviewDatabaseClient, InteractionDatabaseClient, TicketDatabaseClient],
      imports: [MainConfigModule],
      useFactory: (config: MainConfigService) => ({
        connection: config.get('DB_URL'),
      }),
      inject: [MainConfigService],
    }),
  ],
  providers: [
    { provide: TransactionHost, useClass: TransactionHostPg },
    { provide: TransactionHostPg, useExisting: TransactionHost },
  ],
  exports: [DatabaseModule, TransactionHost, TransactionHostPg],
})
export class MainDbModule {}

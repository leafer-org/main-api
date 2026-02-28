import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/apps/app.module.js';
import { TransactionHostPg } from '@/infra/db/tx-host-pg.js';
import { ConnectionPool } from '@/infra/lib/nest-drizzle/index.js';

export type E2eApp = {
  app: INestApplication;
  agent: ReturnType<typeof request>;
};

export async function createApp(): Promise<E2eApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    // DrizzleFileRepository injects TransactionHostPg by class token,
    // but MainDbModule registers it under abstract TransactionHost token.
    // Provide the concrete class token as well.
    .overrideProvider(TransactionHostPg)
    .useFactory({
      factory: (pool: ConnectionPool) => new TransactionHostPg(pool),
      inject: [ConnectionPool],
    })
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return {
    app,
    agent: request(app.getHttpServer()),
  };
}

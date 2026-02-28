import type { INestApplication } from '@nestjs/common';

import { publicContractsMiddleware } from '@/infra/contracts/middleware.js';

export function configureApp(app: INestApplication): void {
  publicContractsMiddleware(app);
}

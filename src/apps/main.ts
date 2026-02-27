import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { MainConfigService } from '@/infra/config/service.js';
import { publicContractsMiddleware } from '@/infra/contracts/middleware.js';

async function bootstrap() {
  const logger = new Logger();
  const app = await NestFactory.create(AppModule);
  const config = app.get(MainConfigService);
  publicContractsMiddleware(app);
  await app.listen(config.get('PORT'));
  logger.log(`Server running on port ${config.get('PORT')}`);
}
void bootstrap();

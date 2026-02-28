import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';
import { MainConfigService } from '@/infra/config/service.js';

async function bootstrap() {
  const logger = new Logger();
  const app = await NestFactory.create(AppModule);
  const config = app.get(MainConfigService);
  configureApp(app);
  await app.listen(config.get('PORT'));
  logger.log(`Server running on port ${config.get('PORT')}`);
}
void bootstrap();

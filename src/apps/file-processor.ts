import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { FileProcessorModule } from './file-processor.module.js';

async function bootstrap() {
  const logger = new Logger('FileProcessor');
  const app = await NestFactory.createApplicationContext(FileProcessorModule);

  logger.log('File processor started, waiting for video processing jobs...');

  const onSignal = async () => {
    logger.log('Shutting down file processor...');
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);
}
void bootstrap();

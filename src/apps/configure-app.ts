import type { INestApplication } from '@nestjs/common';
import express from 'express';

import { publicContractsMiddleware } from '@/infra/contracts/middleware.js';

export function configureApp(app: INestApplication): void {
  // Ensure body parsing is available before OpenAPI validation.
  // NestFactory.create() sets this up via init(), but in tests
  // createNestApplication() has not called init() yet.
  app.use(express.json());
  publicContractsMiddleware(app);
}

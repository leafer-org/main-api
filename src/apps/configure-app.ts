import type { INestApplication } from '@nestjs/common';
import cors from 'cors';
import express from 'express';

import { publicContractsMiddleware } from '@/infra/contracts/middleware.js';

export function configureApp(app: INestApplication): void {
  // Trust proxy so that req.ip returns the real client IP behind a reverse proxy.
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.getInstance().set('trust proxy', true);

  // CORS must be registered before OpenAPI validation
  // so that OPTIONS preflight requests are handled immediately.
  app.use(cors({ origin: true, credentials: true }));

  // Ensure body parsing is available before OpenAPI validation.
  // NestFactory.create() sets this up via init(), but in tests
  // createNestApplication() has not called init() yet.
  app.use(express.json());
  publicContractsMiddleware(app);
}

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '@/apps/app.module.js';
import { configureApp } from '@/apps/configure-app.js';

export type E2eApp = {
  app: INestApplication;
  agent: ReturnType<typeof request>;
};

export async function createApp(): Promise<E2eApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return {
    app,
    agent: request(app.getHttpServer()),
  };
}

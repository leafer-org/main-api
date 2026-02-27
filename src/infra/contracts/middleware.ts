import type { INestApplication } from '@nestjs/common';
import * as OpenApiValidator from 'express-openapi-validator';

// biome-ignore lint/correctness/useImportExtensions: dynamic import of JSON file
import generatedPublicSchema from './generated-public-schema.json' with { type: 'json' };
import { OpenApiExceptionFilter } from './openapi-exception-filter.js';

export const publicContractsMiddleware = (app: INestApplication) => {
  const publicMiddleware = OpenApiValidator.middleware({
    apiSpec: generatedPublicSchema as never,
    validateRequests: true,
    validateResponses: true,
  });

  app.use(publicMiddleware);
  app.useGlobalFilters(new OpenApiExceptionFilter());
};

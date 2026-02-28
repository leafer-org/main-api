import { HttpException } from '@nestjs/common';

import type * as PublicSchema from './generated-public-schema.js';

type ResBody<T, S extends number> = T extends {
  responses: { [K in S]: { content: { 'application/json': infer F } } };
}
  ? F
  : never;

type OperationErrorBody<K extends keyof PublicSchema.operations> =
  | ResBody<PublicSchema.operations[K], 400>
  | ResBody<PublicSchema.operations[K], 401>
  | ResBody<PublicSchema.operations[K], 403>
  | ResBody<PublicSchema.operations[K], 404>
  | ResBody<PublicSchema.operations[K], 429>;

export function apiError<K extends keyof PublicSchema.operations>(
  _operation: K,
  body: OperationErrorBody<K>,
  status: number,
): HttpException {
  return new HttpException(body, status);
}

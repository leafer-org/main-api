import { HttpException } from '@nestjs/common';

import type * as PublicSchema from './generated-public-schema.js';

type ApplicationJSON<T> = T extends { content: { 'application/json': infer F } } ? F : never;

type Errors<K extends keyof PublicSchema.operations> = {
  [C in keyof PublicSchema.operations[K]['responses']]?: ApplicationJSON<
    PublicSchema.operations[K]['responses'][C]
  >;
};

type DomainErrorResponse = { [code: number]: { type: string; message?: string; data?: unknown } };

export function domainToHttpError<K extends keyof PublicSchema.operations>(
  error: Errors<K> | DomainErrorResponse,
) {
  const [key] = Object.keys(error);
  const e = (error as Record<string, unknown>)[key!];

  return new HttpException(e as Record<string, unknown>, parseInt(key ?? '500', 10));
}

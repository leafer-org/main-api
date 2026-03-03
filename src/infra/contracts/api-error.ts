import { HttpException } from '@nestjs/common';

import type * as PublicSchema from './generated-public-schema.js';

type ApplicationJSON<T> = T extends { content: { 'application/json': infer F } } ? F : never;

type Errors<K extends keyof PublicSchema.operations> = {
  [C in keyof PublicSchema.operations[K]['responses']]?: ApplicationJSON<
    PublicSchema.operations[K]['responses'][C]
  >;
};

export function domainToHttpError<K extends keyof PublicSchema.operations>(error: Errors<K>) {
  const [key] = Object.keys(error);
  const e = (error as Record<string, unknown>)[key as string];

  return new HttpException(e as Record<string, unknown>, parseInt(key ?? '500', 10));
}

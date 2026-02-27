import type { Mock } from 'vitest';

/**
 * Преобразует методы интерфейса в типизированные моки
 */
export type Mocked<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? Mock<(...args: A) => R> : T[K];
};

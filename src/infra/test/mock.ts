/** biome-ignore-all lint/suspicious/noExplicitAny: generic types */
import { type Mock, vitest } from 'vitest';

import {
  createTransaction,
  type Transaction,
  TransactionHost,
} from '@/kernel/application/ports/tx-host.js';

export function ServiceMock<T>(): {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? Mock<T[K]>
    : { error: 'service mock works only with methods' };
} {
  const mocksMap = new Map();

  return new Proxy({} as any, {
    get(_, prop) {
      if (!mocksMap.has(prop)) {
        mocksMap.set(prop, vitest.fn());
      }
      return mocksMap.get(prop);
    },
  });
}

export class MockTransactionHost extends TransactionHost {
  public readonly transaction: Transaction = createTransaction();

  public async startTransaction<T>(cb: (transaction: Transaction) => Promise<T>): Promise<T> {
    return cb(this.transaction);
  }
}

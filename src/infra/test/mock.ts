/** biome-ignore-all lint/suspicious/noExplicitAny: generic types */
import { type Mock, vitest } from 'vitest';

import type { WhereArg } from '@/infra/lib/authorization/permission-service.js';
import type { InferPermissionValue, PermissionVariant } from '@/infra/lib/authorization/schema.js';
import { type Either, isLeft, Left, Right } from '@/infra/lib/box.js';
import {
  PermissionCheckService,
  PermissionDeniedError,
} from '@/kernel/application/ports/permission.js';
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

export class MockPermissionCheckService extends PermissionCheckService {
  private result: Either<PermissionDeniedError, void> = Right(undefined);

  public deny(action = 'TEST', role = 'USER'): this {
    this.result = Left(new PermissionDeniedError({ action, role }));
    return this;
  }

  public allow(): this {
    this.result = Right(undefined);
    return this;
  }

  public can<T extends PermissionVariant>(
    _perm: T,
    ..._args: WhereArg<InferPermissionValue<T>>
  ): boolean {
    return !isLeft(this.result);
  }

  public mustCan<T extends PermissionVariant>(
    _perm: T,
    ..._args: WhereArg<InferPermissionValue<T>>
  ): Either<PermissionDeniedError, void> {
    return this.result;
  }
}

import { Injectable } from '@nestjs/common';

import { DatabaseClient } from './service.js';
import {
  createTransaction,
  type IsolationLevel,
  type Transaction,
  TransactionHost,
} from '@/kernel/application/ports/tx-host.js';

type DrizzleTx = DatabaseClient['db'];

const ISOLATION_LEVEL_MAP = {
  'read-uncommited': 'read uncommitted',
  'read-commited': 'read committed',
  'repeatable-read': 'repeatable read',
  serializable: 'serializable',
} as const satisfies Record<IsolationLevel, string>;

@Injectable()
export class TransactionHostPg extends TransactionHost {
  private readonly transactions = new WeakMap<Transaction, DrizzleTx>();
  public constructor(private readonly dbClient: DatabaseClient) {
    super();
  }

  public async startTransaction<T>(
    cb: (transaction: Transaction) => Promise<T>,
    isolationLevel?: IsolationLevel,
  ): Promise<T> {
    return this.dbClient.db.transaction(
      async (tx) => {
        const transaction = createTransaction();
        this.transactions.set(transaction, tx);
        return cb(transaction);
      },
      {
        isolationLevel: ISOLATION_LEVEL_MAP[isolationLevel ?? 'read-commited'],
      },
    );
  }

  public get(transaction: Transaction): DrizzleTx {
    if (transaction.type === 'no-transaction') {
      return this.dbClient.db;
    }
    const tx = this.transactions.get(transaction);
    if (!tx) {
      throw new Error('transaction not existed');
    }
    return tx;
  }
}

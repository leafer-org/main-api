export type Transaction = { type: 'transaction' } | { type: 'no-transaction' };

export const NO_TRANSACTION = { type: 'no-transaction' } as const;

export const createTransaction = (): Transaction => ({
  type: 'transaction',
});

export type IsolationLevel =
  | 'read-uncommited'
  | 'read-commited'
  | 'repeatable-read'
  | 'serializable';

export abstract class TransactionHost {
  public abstract startTransaction<T>(
    cb: (transaction: Transaction, isolationLevel?: IsolationLevel) => Promise<T>,
  ): Promise<T>;
}

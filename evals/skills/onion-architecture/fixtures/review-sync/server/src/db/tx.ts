import type { Db } from './client.js';
import type { Tx, TransactionRunner } from '../platform/transaction.js';

export class DrizzleTransactionRunner implements TransactionRunner {
  constructor(private readonly db: Db) {}

  run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => fn(tx as unknown as Tx));
  }
}

export function dbOrTx(db: Db, tx?: Tx): Db {
  return (tx as unknown as Db | undefined) ?? db;
}

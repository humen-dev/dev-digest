declare const txBrand: unique symbol;

export type Tx = { readonly [txBrand]: true };

export interface TransactionRunner {
  run<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

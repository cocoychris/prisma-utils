type AnyFunction = (...args: any[]) => any;

export type ClassConstructor<T> = () => T;

export interface IPrismaClient {
  [K: symbol]: { types: any };
  $on: AnyFunction;
  $connect: AnyFunction;
  $disconnect: AnyFunction;
  $use: AnyFunction;
  $executeRaw: AnyFunction;
  $executeRawUnsafe: AnyFunction;
  $queryRaw: AnyFunction;
  $queryRawUnsafe: AnyFunction;
  $transaction: AnyFunction;
}

export type TransactionClient<T extends IPrismaClient> = Omit<
  T,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export interface IPrismaClientKnownRequestError extends Error {
  code: string;
  meta?: Record<string, unknown>;
  clientVersion: string;
  batchRequestIdx?: number;
  get [Symbol.toStringTag](): string;
}

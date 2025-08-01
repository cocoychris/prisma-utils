import { PrismaClient } from "@prisma/client";
import { PrismaTransactionClient } from "../types";

/**
 * A watcher for Prisma transactions.
 * Use it to register handlers that execute after a transaction is committed or rolled back.
 * The watcher can be passed to other functions, allowing them to add operations
 * to the transaction via the `client` property.
 *
 * 此物件代表一個 Prisma Transaction 的監聽器
 * 此監聽器允許你註冊 Transaction 成功或失敗(回滾)後要觸發的處理器。
 * 也可以將此 TransactionWatcher 傳入其他函式中，
 * 並透過 client 屬性來加入要放入 Transaction 中執行的資料庫操作。
 */
type TransactionWatcher<T> = _TransactionWatcher<T>;
type SuccessHandler<T> = (result: T) => T | Promise<T>;
type ErrorHandler = (error: unknown) => void | Promise<void>;

const TRANSACTION_SUCCESS_HANDLER_KEY = Symbol("TransactionSuccessAccessKey");
const TRANSACTION_ERROR_HANDLER_KEY = Symbol("TransactionErrorAccessKey");

class _TransactionWatcher<T> {
  private _successHandlers: SuccessHandler<T>[] = [];
  private _errorHandlers: ErrorHandler[] = [];
  private _isTerminated = false;

  /**
   * Returns `true` if the transaction has been terminated (committed or rolled back).
   *
   * 指出此 Transaction 是否已經結束
   *
   * 當 Transaction 被成功 commit 或 rollback 後，此屬性會變成 `true`。
   * 注意：結束後仍可能有 successHandlers 或 errorHandlers 在執行中。
   */
  get isTerminated(): boolean {
    return this._isTerminated;
  }
  /**
   * The Prisma client for this transaction.
   * Throws an error if accessed after the transaction is terminated.
   *
   * 用於執行 Transaction 的 PrismaClient。
   * 若 Transaction 已經結束，嘗試讀取此屬性會拋出錯誤。
   */
  get client(): PrismaTransactionClient {
    this._assertNotTerminated();
    return this._client;
  }

  constructor(private readonly _client: PrismaTransactionClient) {}

  /**
   * Registers a handler to run when the transaction is successfully committed.
   * The handler must return the result it received, or a new result of the same type,
   * to be passed to subsequent handlers.
   *
   * 註冊一個成功處理器
   * 只有當交易確認成功時，才會執行此處理器。
   * @param handler - 成功處理器。注意：必須傳回收到的 result，或傳回相同型別的新 result 供其他後續被呼叫的 handlers 使用。
   */
  onSuccess(handler: (result: T) => T | Promise<T>): this {
    this._assertNotTerminated();
    this._successHandlers.push(handler);
    return this;
  }
  /**
   * Registers a handler to run when the transaction fails and is rolled back.
   *
   * 註冊一個錯誤處理器
   * 只有當交易發生錯誤（並觸發回滾）時，才會執行此處理器。
   *
   * 可透過此處理器來處理回滾後的邏輯。
   * @param handler - 錯誤處理器
   */
  onError(handler: (error: any) => void | Promise<void>): this {
    this._assertNotTerminated();
    this._errorHandlers.push(handler);
    return this;
  }

  private async [TRANSACTION_SUCCESS_HANDLER_KEY](result: T): Promise<T> {
    this._isTerminated = true;
    for (const handler of this._successHandlers) {
      result = await handler(result);
    }
    return result;
  }
  private async [TRANSACTION_ERROR_HANDLER_KEY](error: any): Promise<void> {
    this._isTerminated = true;
    for (const handler of this._errorHandlers) {
      await handler(error);
    }
  }

  private _assertNotTerminated(): void {
    if (this._isTerminated) {
      throw new Error("Transaction has already been terminated.");
    }
  }
}

interface WatcherOptions<T> {
  prisma: PrismaClient;
  successHandlerErrorLogger?: (error: any) => void;
  errorHandlerErrorLogger?: (error: any) => void;
  existingWatcher?: TransactionWatcher<T>;
}

/**
 * Creates a Prisma transaction monitored by a `TransactionWatcher`.
 * The watcher triggers custom handlers upon transaction commit or rollback.
 * If an `existingWatcher` is provided, it's used instead of creating a new one.
 * Note: This function returns as soon as the transaction completes,
 * without waiting for the success or error handlers to finish.
 *
 * 建立一個由 TransactionWatcher 監控的 Prisma Transaction。
 * TransactionWatcher 會在 Transaction 成功或失敗(回滾)時觸發你自訂的處理器函數。
 * 注意：此函數會在 Transaction 成功或失敗後立即返回結果，不會等待成功或錯誤處理器完成。
 *
 * @param options.prisma - A `PrismaClient` instance for creating a new transaction. Cannot be a `PrismaTransactionClient`.
 * @param options.successHandlerErrorLogger - Logger for errors in success handlers. Defaults to `console.error`.
 * @param options.errorHandlerErrorLogger - Logger for errors in error handlers. Defaults to `console.error`.
 * @param options.existingWatcher - Use an existing `TransactionWatcher` instead of creating a new one.
 * @param exec - A function containing the transaction's operations, using the `watcher.client`.
 */
export async function watchedTransaction<T = any>(
  {
    prisma,
    successHandlerErrorLogger = console.error,
    errorHandlerErrorLogger = console.error,
    existingWatcher,
  }: WatcherOptions<T>,
  exec: (watcher: TransactionWatcher<T>) => Promise<T>
): Promise<T> {
  if (existingWatcher) {
    return exec(existingWatcher);
  }
  let watcher: TransactionWatcher<T> | undefined;
  try {
    const result = await prisma.$transaction(
      async (client: PrismaTransactionClient) => {
        watcher = new _TransactionWatcher<T>(client);
        return exec(watcher);
      }
    );
    watcher!
      [TRANSACTION_SUCCESS_HANDLER_KEY](result)
      .catch(successHandlerErrorLogger);
    return result;
  } catch (error) {
    if (watcher) {
      watcher[TRANSACTION_ERROR_HANDLER_KEY](error).catch(
        errorHandlerErrorLogger
      );
    }
    throw error;
  }
}

/**
 * Executes a function within a transaction.
 * It starts a new transaction if not already in one, or uses the existing transaction.
 *
 * 會自動根據所提供的 `prismaOrClient` 參數判斷目前是否已經在 transaction 環境當中，並確保 exec 是在 transaction 中執行
 *
 * 建議可改用 `watchedTransaction()` 函數使用上會更加靈活。
 * @param prismaOrClient - A `PrismaClient` or `PrismaTransactionClient`. A new transaction is started if a `PrismaClient` is provided.
 * @param exec - The function to execute within the transaction.
 */
export async function useTransaction<T>(
  prismaOrClient: PrismaClient | PrismaTransactionClient,
  exec: (client: PrismaTransactionClient) => Promise<T>
): Promise<T> {
  if (prismaOrClient instanceof PrismaClient && prismaOrClient.$transaction) {
    return await prismaOrClient.$transaction(exec);
  }
  return await exec(prismaOrClient);
}

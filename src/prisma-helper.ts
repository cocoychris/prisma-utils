import { PrismaErrorCode } from "./constants";
import {
  ClassConstructor,
  IPrismaClient,
  IPrismaClientKnownRequestError,
  TransactionClient,
} from "./types";

interface ManagerOptions {
  successHandlerErrorLogger?: (error: any) => void;
  errorHandlerErrorLogger?: (error: any) => void;
}

type SuccessHandler<Result> = (result: Result) => void | Promise<void>;
type ErrorHandler = (error: unknown) => void | Promise<void>;

const TRANSACTION_SUCCESS_HANDLER_KEY = Symbol("TransactionSuccessAccessKey");
const TRANSACTION_ERROR_HANDLER_KEY = Symbol("TransactionErrorAccessKey");

/**
 * A manager for Prisma transactions.
 * Use it to register handlers that execute after a transaction is committed or rolled back.
 * The manager can be passed to other functions, allowing them to add operations
 * to the transaction via the `client` property.
 *
 * 此物件代表一個 Prisma Transaction 的管理器
 * 此管理器允許你註冊 Transaction 成功或失敗(回滾)後要觸發的處理器。
 * 也可以將此 TransactionManager 傳入其他函式中，
 * 並透過 client 屬性來加入要在 Transaction 中執行的資料庫操作。
 */
export type TransactionManager<
  Result,
  PrismaClient extends IPrismaClient
> = _TransactionManager<Result, PrismaClient>;

/**
 * @see TransactionManager
 */
class _TransactionManager<Result, PrismaClient extends IPrismaClient> {
  private _successHandlers: SuccessHandler<Result>[] = [];
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
  get client(): TransactionClient<PrismaClient> {
    this._assertNotTerminated();
    return this._client;
  }

  constructor(private readonly _client: TransactionClient<PrismaClient>) {}

  /**
   * Registers a handler to run when the transaction is successfully committed.
   *
   * 註冊一個成功處理器
   * 只有當交易確認成功時，才會執行此處理器。
   * @param handler - 成功處理器。
   */
  onSuccess(handler: SuccessHandler<Result>): this {
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
  onError(handler: ErrorHandler): this {
    this._assertNotTerminated();
    this._errorHandlers.push(handler);
    return this;
  }

  private async [TRANSACTION_SUCCESS_HANDLER_KEY](
    result: Result
  ): Promise<void> {
    this._isTerminated = true;
    for (const handler of this._successHandlers) {
      await handler(result);
    }
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

export class PrismaHelper<
  PrismaClient extends IPrismaClient,
  PrismaClientKnownRequestError extends IPrismaClientKnownRequestError
> {
  constructor(
    private readonly PrismaClientClass: ClassConstructor<PrismaClient>
  ) {}

  /**
   * Checks if an error is a `PrismaClientKnownRequestError` with a specific error code.
   * Optionally, it can also check if the error relates to a specific model or target fields.
   * 判斷是否為特定的 Prisma 錯誤
   * @param error The error object to inspect.
   * @param errorCode The `PrismaErrorCode` to match.
   * @param metaPatterns Optional patterns to match against the error's meta information.
   * @param messagePatterns Optional patterns to match against the error's message.
   * @returns `true` if the error matches all specified criteria, otherwise `false`.
   */
  isPrismaError(
    error: unknown,
    errorCode: PrismaErrorCode,
    metaPatterns?: RegExp | string | string[] | null,
    messagePatterns?: RegExp | string | string[] | null
  ): error is PrismaClientKnownRequestError {
    // 不是 Prisma 錯誤
    if (
      !(error instanceof Error) ||
      (error as any).name !== "PrismaClientKnownRequestError"
    ) {
      return false;
    }
    // 錯誤代碼不符
    const prismaError = error as IPrismaClientKnownRequestError;
    if (prismaError.code !== errorCode) {
      return false;
    }
    const metaString = JSON.stringify(prismaError.meta || {});
    if (metaPatterns) {
      if (Array.isArray(metaPatterns)) {
        return metaPatterns.some((p) => metaString.includes(p));
      } else if (metaPatterns instanceof RegExp) {
        return metaPatterns.test(metaString);
      } else {
        return metaString.includes(metaPatterns);
      }
    }
    if (messagePatterns) {
      if (Array.isArray(messagePatterns)) {
        return messagePatterns.some((p) => prismaError.message.includes(p));
      } else if (messagePatterns instanceof RegExp) {
        return messagePatterns.test(prismaError.message);
      } else {
        return prismaError.message.includes(messagePatterns);
      }
    }
    // 查無 target
    return false;
  }

  /**
   * Creates a Prisma transaction monitored by a `TransactionManager`.
   * The manager triggers custom handlers upon transaction commit or rollback.
   * Note: This function returns/rejects as soon as the transaction is committed or rolled back,
   * without waiting for the success or error handlers to finish.
   *
   * 建立一個由 TransactionManager 監控的 Prisma Transaction。
   * TransactionManager 會在 Transaction 成功或失敗(回滾)時觸發你自訂的處理器函數。
   * 注意：此函數會在 Transaction 成功或失敗後立即 resolve/reject ，不會等待成功或錯誤處理器完成。
   *
   * @param prisma - A `PrismaClient` instance for creating a new transaction. Cannot be a `PrismaTransactionClient`.
   * @param exec - A function containing the transaction's operations, using the `manager.client`.
   * @param options.successHandlerErrorLogger - Logger for errors in success handlers. Defaults to `console.error`.
   * @param options.errorHandlerErrorLogger - Logger for errors in error handlers. Defaults to `console.error`.
   */
  async useTransactionManager<Result = any>(
    prisma: PrismaClient,
    exec: (
      manager: TransactionManager<Result, PrismaClient>
    ) => Promise<Result>,
    options: ManagerOptions = {}
  ): Promise<Result> {
    const {
      successHandlerErrorLogger = console.error,
      errorHandlerErrorLogger = console.error,
    } = options;
    let manager: TransactionManager<Result, PrismaClient> | undefined;
    try {
      const result = await prisma.$transaction(
        async (client: TransactionClient<PrismaClient>) => {
          manager = new _TransactionManager<Result, PrismaClient>(client);
          return exec(manager);
        }
      );
      manager!
        [TRANSACTION_SUCCESS_HANDLER_KEY](result)
        .catch(successHandlerErrorLogger);
      return result;
    } catch (error) {
      if (manager) {
        manager[TRANSACTION_ERROR_HANDLER_KEY](error).catch(
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
   * @param prismaOrClient - A `PrismaClient` or `PrismaTransactionClient`. A new transaction is started if a `PrismaClient` is provided.
   * @param exec - The function to execute within the transaction.
   */
  async useTransaction<T>(
    prismaOrClient: PrismaClient | TransactionClient<PrismaClient>,
    exec: (client: TransactionClient<PrismaClient>) => Promise<T>
  ): Promise<T> {
    if (
      prismaOrClient instanceof this.PrismaClientClass &&
      (prismaOrClient as PrismaClient).$transaction
    ) {
      return await (prismaOrClient as PrismaClient).$transaction(exec);
    }
    return await exec(prismaOrClient as TransactionClient<PrismaClient>);
  }
}

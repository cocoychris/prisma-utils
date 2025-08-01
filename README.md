# Prisma Utils

Prisma Utils is a collection of utilities for Node.js projects that use Prisma. It offers advanced tools for transaction management and error handling.

These tools are gathered form my old NestJS projects so that I can use them in my future projects.

Prisma 工具包是一組專為 Node.js 專案打造的 Prisma 實用工具。它提供了進階的 Transaction 操作工具和 Prisma Error 處理工具。

## Main Features

- **Transaction Manager**: Create managed transactions that allow you to register handlers for success (commit) or rollback events. This is useful for side effects that should only run if the transaction completes successfully, such as sending notifications or clearing caches.
  - See `useTransactionManager()` in `src/utils/transaction.ts`.
- **Prisma Error Handling**: Utilities to identify and handle specific Prisma errors by their error codes.
  - See `isPrismaError()` in `src/utils/error-handling.ts`.
  - Includes the `PrismaErrorCode` enum from the [PrismaError](https://www.npmjs.com/package/prisma-error-enum) package for easy error code checking.

## Other Utilities

- Additional constants, types, and utility functions are available in:
  - `src/constants.ts`
  - `src/types.ts`
  - `src/utils/*.ts`

## Note
This package requires Prisma Client as a dependency.

Before using this package, you must generate the Prisma Client by running `npx prisma generate`.

## By the way

- Taiwan is obviously a country, and it is not part of China (wink).
- Happy coding with Prisma!

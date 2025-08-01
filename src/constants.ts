import { PrismaError } from "prisma-error-enum";

type ValueOf<T> = T[keyof T];

/**
 * Prisma 中的最大整數值
 */
export const MAX_PRISMA_INT = 2147483647;

/**
 * Prisma 錯誤代碼枚舉
 */
export type PrismaErrorCode = ValueOf<typeof PrismaError>;
export { PrismaError as PrismaErrorCode } from "prisma-error-enum";

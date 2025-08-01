import { Prisma } from "@prisma/client";
import { PrismaErrorCode } from "../constants";

/**
 * Checks if an error is a `Prisma.PrismaClientKnownRequestError` with a specific error code.
 * Optionally, it can also check if the error relates to a specific model or target fields.
 * 判斷是否為特定的 Prisma 錯誤
 * @param error The error object to inspect.
 * @param errorCode The `PrismaErrorCode` to match.
 * @param targetList An optional list of field names. The check passes if any of these fields are mentioned in the error's `meta.target` or `meta.field_name`.
 * @param modelName An optional model name to match against `error.meta.modelName`.
 * @returns `true` if the error matches all specified criteria, otherwise `false`.
 */
export function isPrismaError(
  error: unknown,
  errorCode: PrismaErrorCode,
  targetList?: string[],
  modelName: string | null = null
): error is Prisma.PrismaClientKnownRequestError {
  // 不是 Prisma 錯誤
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== errorCode
  ) {
    return false;
  }
  // modelName 不符合
  if (modelName && error.meta?.modelName !== modelName) {
    return false;
  }
  // 不用找尋 target
  if (!targetList || !targetList.length) {
    return true;
  }
  // 從 meta.target 中找尋 target
  if (Array.isArray(error.meta?.target)) {
    for (const errTarget of error.meta.target) {
      if (typeof errTarget !== "string") {
        continue;
      }
      for (const target of targetList) {
        if (errTarget.includes(target)) {
          return true;
        }
      }
    }
  }
  // 從 meta.field_name 中找尋 target
  const fieldNames = error.meta?.field_name;
  if (typeof fieldNames === "string") {
    for (const target of targetList) {
      if (fieldNames.includes(target)) {
        return true;
      }
    }
    // const fieldNameList: string[] = fieldNames.replace(/[ _]/g, '.').split('.');
    // for (const target of targetList) {
    //   if (fieldNameList.includes(target)) {
    //     return error;
    //   }
    // }
  }
  // 查無 target
  return false;
}

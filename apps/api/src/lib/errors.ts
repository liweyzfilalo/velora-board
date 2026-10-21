import type { ErrorCode } from "@velora/shared";
import { ZodError } from "zod";

const HTTP_STATUS: Record<ErrorCode, number> = {
  CONFLICT: 409,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  VALIDATION: 400,
  RATE_LIMITED: 429,
  UNAUTHORIZED: 401,
  INTERNAL: 500,
};

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly current?: unknown,
  ) {
    super(message);
  }

  get status(): number {
    return HTTP_STATUS[this.code];
  }
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    return new AppError("VALIDATION", issue ? `${issue.path.join(".") || "input"}: ${issue.message}` : "Invalid input");
  }
  console.error(err);
  return new AppError("INTERNAL", "Internal server error");
}

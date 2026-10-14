/** Errors the API returns on purpose. Anything else becomes a 500 with no details. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new AppError(400, code, message, details);
export const unauthorized = (message = "Sign in required", code = "unauthorized") => new AppError(401, code, message);
export const forbidden = (message = "You do not have access to this", code = "forbidden") => new AppError(403, code, message);
export const notFound = (what = "Resource") => new AppError(404, "not_found", `${what} not found`);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const tooManyRequests = (message: string, retryAfterSeconds?: number) =>
  new AppError(429, "rate_limited", message, retryAfterSeconds ? { retryAfterSeconds } : undefined);

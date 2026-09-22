export type ErrorDetails =
  | Record<string, unknown>
  | string[]
  | string
  | null
  | undefined;

/**
 * Operational application error used across Nest services.
 * isOperational=true → safe to expose message/details to clients.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details: ErrorDetails;
  public readonly code: string;

  constructor(
    message: string,
    statusCode = 500,
    isOperational = true,
    details: ErrorDetails = null,
    code = 'APP_ERROR',
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details ?? null;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace?.(this, this.constructor);
  }
}

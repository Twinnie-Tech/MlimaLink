import { AppError, type ErrorDetails } from './app.error.js';

/** Resource or route was not found (404). */
export function notFound(
  resource = 'Resource',
  details?: ErrorDetails,
): AppError {
  return new AppError(`${resource} not found`, 404, true, details, 'NOT_FOUND');
}

/** Alias for missing domain entity. */
export function resourceNotFound(
  resource: string,
  id?: string | number,
): AppError {
  return notFound(resource, id !== undefined ? { id } : null);
}

/** Request validation failed (400). */
export function validationError(
  message = 'Validation failed',
  details?: ErrorDetails,
): AppError {
  return new AppError(message, 400, true, details, 'VALIDATION_ERROR');
}

/** Missing/invalid credentials (401). */
export function unauthorized(
  message = 'Unauthorized',
  details?: ErrorDetails,
): AppError {
  return new AppError(message, 401, true, details, 'UNAUTHORIZED');
}

/** Authenticated but not allowed (403). */
export function forbidden(
  message = 'Forbidden',
  details?: ErrorDetails,
): AppError {
  return new AppError(message, 403, true, details, 'FORBIDDEN');
}

/** Persistence / DB failure (500, non-operational by default). */
export function databaseError(
  message = 'Database error',
  details?: ErrorDetails,
): AppError {
  return new AppError(message, 500, false, details, 'DATABASE_ERROR');
}

/** Too many requests (429). */
export function rateLimitError(
  message = 'Too many requests',
  details?: ErrorDetails,
): AppError {
  return new AppError(message, 429, true, details, 'RATE_LIMIT');
}

/** Generic operational client/server error. */
export function appError(
  message: string,
  statusCode: number,
  details?: ErrorDetails,
  code = 'APP_ERROR',
): AppError {
  return new AppError(message, statusCode, true, details, code);
}

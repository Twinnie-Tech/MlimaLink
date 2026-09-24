import { describe, expect, it } from 'vitest';
import { AppError } from './app.error.js';
import {
  databaseError,
  forbidden,
  notFound,
  rateLimitError,
  resourceNotFound,
  unauthorized,
  validationError,
} from './error-helpers.js';

describe('AppError', () => {
  it('stores statusCode, isOperational, details, and code', () => {
    const error = new AppError('boom', 400, true, { field: 'email' }, 'CUSTOM');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('boom');
    expect(error.statusCode).toBe(400);
    expect(error.isOperational).toBe(true);
    expect(error.details).toEqual({ field: 'email' });
    expect(error.code).toBe('CUSTOM');
  });
});

describe('error helpers', () => {
  it('notFound returns 404 operational error', () => {
    const error = notFound('Product', { id: '1' });
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.isOperational).toBe(true);
    expect(error.message).toBe('Product not found');
  });

  it('resourceNotFound includes id in details', () => {
    const error = resourceNotFound('User', 42);
    expect(error.details).toEqual({ id: 42 });
  });

  it('validationError returns 400', () => {
    const error = validationError('Invalid payload', ['email is required']);
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
  });

  it('unauthorized returns 401', () => {
    expect(unauthorized().statusCode).toBe(401);
  });

  it('forbidden returns 403', () => {
    expect(forbidden().statusCode).toBe(403);
  });

  it('databaseError is non-operational 500', () => {
    const error = databaseError();
    expect(error.statusCode).toBe(500);
    expect(error.isOperational).toBe(false);
  });

  it('rateLimitError returns 429', () => {
    expect(rateLimitError().statusCode).toBe(429);
  });
});

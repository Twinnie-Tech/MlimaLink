import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AppError } from './app.error.js';

export interface ErrorResponseBody {
  data: null;
  success: false;
  error: string;
  details: unknown;
  code?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, body, isOperational } = this.normalize(exception);

    if (!isOperational || statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(statusCode).json(body);
  }

  private normalize(exception: unknown): {
    statusCode: number;
    body: ErrorResponseBody;
    isOperational: boolean;
  } {
    if (exception instanceof AppError) {
      const expose = exception.isOperational;
      return {
        statusCode: exception.statusCode,
        isOperational: exception.isOperational,
        body: {
          data: null,
          success: false,
          error: expose ? exception.message : 'Internal server error',
          details: expose ? (exception.details ?? null) : null,
          code: expose ? exception.code : 'INTERNAL_ERROR',
        },
      };
    }

    if (exception instanceof ThrottlerException) {
      return {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        isOperational: true,
        body: {
          data: null,
          success: false,
          error: 'Too many requests',
          details: null,
          code: 'RATE_LIMIT',
        },
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const raw = exception.getResponse();
      const { message, details, code } = this.fromHttpExceptionBody(raw);

      return {
        statusCode,
        isOperational: statusCode < 500,
        body: {
          data: null,
          success: false,
          error: message,
          details,
          code,
        },
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      isOperational: false,
      body: {
        data: null,
        success: false,
        error: 'Internal server error',
        details: null,
        code: 'INTERNAL_ERROR',
      },
    };
  }

  private fromHttpExceptionBody(raw: string | object): {
    message: string;
    details: unknown;
    code: string;
  } {
    if (typeof raw === 'string') {
      return { message: raw, details: null, code: 'HTTP_EXCEPTION' };
    }

    const obj = raw as Record<string, unknown>;

    if (typeof obj.error === 'string' && obj.success === false) {
      return {
        message: obj.error,
        details: obj.details ?? null,
        code: typeof obj.code === 'string' ? obj.code : 'HTTP_EXCEPTION',
      };
    }

    const message = Array.isArray(obj.message)
      ? 'Validation failed'
      : typeof obj.message === 'string'
        ? obj.message
        : typeof obj.error === 'string'
          ? obj.error
          : 'Request failed';

    const details = Array.isArray(obj.message)
      ? obj.message
      : (obj.details ?? null);

    return {
      message,
      details,
      code: typeof obj.code === 'string' ? obj.code : 'HTTP_EXCEPTION',
    };
  }
}

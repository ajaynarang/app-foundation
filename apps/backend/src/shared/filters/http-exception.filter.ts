import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { isSilentPath } from '../../infrastructure/logging/log-filter';

/**
 * Global exception filter for consistent error responses.
 * Centralizes error handling and logging across all controllers.
 *
 * Benefits:
 * - Consistent error response format
 * - Automatic error logging with context
 * - Eliminates 65+ duplicate error handling blocks
 * - Handles both HTTP exceptions and unexpected errors
 * - Two-layer messages: user-facing `detail` + dev-only `debugDetail`
 *
 * Usage:
 * Register in AppModule as global filter:
 * ```typescript
 * {
 *   provide: APP_FILTER,
 *   useClass: HttpExceptionFilter,
 * }
 * ```
 *
 * In controllers, just throw standard NestJS exceptions:
 * ```typescript
 * throw new NotFoundException('Driver not found');
 * throw new ForbiddenException('Access denied');
 * throw new BadRequestException('Invalid input');
 * ```
 */

const isDev = process.env.NODE_ENV === 'development';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // --- Prisma known request errors ---
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const { status, detail, debugDetail } = this.mapPrismaError(exception);
      this.sendResponse(request, response, status, detail, debugDetail, exception);
      return;
    }

    // --- Prisma validation errors (malformed queries) ---
    if (exception instanceof Prisma.PrismaClientValidationError) {
      this.sendResponse(
        request,
        response,
        HttpStatus.BAD_REQUEST,
        'Invalid request data. Please check your input and try again.',
        exception.message,
        exception,
      );
      return;
    }

    // --- NestJS HttpExceptions ---
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exResponse = exception.getResponse();

      // HttpException.getResponse() can be string or object
      if (typeof exResponse === 'string') {
        this.sendResponse(request, response, status, exResponse, undefined, exception);
      } else {
        // Preserve structured response (e.g., validation fieldErrors)
        const obj = exResponse as Record<string, any>;
        this.sendResponse(
          request,
          response,
          status,
          obj.detail || obj.message || 'Request failed',
          undefined,
          exception,
          obj,
        );
      }
      return;
    }

    // --- Unhandled / unknown errors — NEVER leak internals ---
    const debugMsg = exception instanceof Error ? exception.message : JSON.stringify(exception);
    this.sendResponse(
      request,
      response,
      HttpStatus.INTERNAL_SERVER_ERROR,
      'Something went wrong. Please try again or contact support.',
      debugMsg,
      exception,
    );
  }

  /**
   * Unified response builder — ensures consistent shape and logging.
   */
  private sendResponse(
    request: Request,
    response: Response,
    status: number,
    detail: string,
    debugDetail: string | undefined,
    exception: unknown,
    extra?: Record<string, any>,
  ) {
    const errorResponse: Record<string, any> = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      detail,
      ...extra,
    };

    // Include debug info ONLY in development
    if (isDev && debugDetail) {
      errorResponse.debugDetail = debugDetail;
    }

    // Log with appropriate level
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} - Status: ${status} - ${detail}`,
        exception instanceof Error ? exception.stack : JSON.stringify(exception),
      );
    } else if (status >= 400 && !isSilentPath(request.url)) {
      this.logger.warn(`${request.method} ${request.url} - Status: ${status} - ${detail}`);
    }

    response.status(status).json(errorResponse);
  }

  /**
   * Maps Prisma error codes to user-friendly messages.
   * Technical details are logged server-side — never exposed to clients.
   */
  private mapPrismaError(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    detail: string;
    debugDetail: string;
  } {
    switch (exception.code) {
      case 'P2002': {
        const target = exception.meta?.target;
        const fields = Array.isArray(target) ? target.join(', ') : 'unknown';
        this.logger.warn(`P2002 unique constraint violation on: ${fields}`);
        return {
          status: HttpStatus.CONFLICT,
          detail: 'A record with this value already exists. Please use a different value.',
          debugDetail: `Unique constraint failed on fields: (${fields})`,
        };
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          detail: 'This record was not found. It may have been deleted.',
          debugDetail: (exception.meta?.cause as string) || 'Record not found',
        };
      case 'P2003': {
        const fieldName = exception.meta?.field_name || 'unknown';
        const fieldNameStr = JSON.stringify(fieldName);
        this.logger.warn(`P2003 foreign key constraint failed on: ${fieldNameStr}`);
        return {
          status: HttpStatus.BAD_REQUEST,
          detail: 'This record cannot be modified because it is linked to other data.',
          debugDetail: `Foreign key constraint failed on field: ${fieldNameStr}`,
        };
      }
      case 'P2014':
        return {
          status: HttpStatus.BAD_REQUEST,
          detail: 'This change would break a required relationship between records.',
          debugDetail: `Required relation violation: ${exception.message}`,
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          detail: 'A database error occurred. Please try again.',
          debugDetail: `Prisma error ${exception.code}: ${exception.message}`,
        };
    }
  }
}

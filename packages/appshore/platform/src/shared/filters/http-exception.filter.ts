import { ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';
import { writeErrorEnvelope } from './error-envelope';

/**
 * The global exception filter: every error a route throws leaves as the one envelope
 * (`statusCode, code, detail, fieldErrors?, timestamp, path, method, debugDetail?` — see `error-envelope.ts`).
 *
 * Services throw NestJS exceptions (or the code-carrying factories in `@appshore/kernel/shared/errors/api-errors`:
 * `fieldError`, `invalidState`, `stale`, `duplicate`); a `ZodError` becomes a 400 with `fieldErrors`;
 * Prisma P2002 → 409 DUPLICATE, P2025 → 404 NOT_FOUND, P2003 and P2014 → 409 INVALID_STATE; anything else → a
 * generic 500 whose message is only logged. Registered as `APP_FILTER`; scoped filters (BearerChallengeFilter)
 * extend it, OAuthErrorFilter replaces it on the RFC 6749/7591 routes.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    writeErrorEnvelope(ctx.getResponse<Response>(), ctx.getRequest<Request>(), exception);
  }
}

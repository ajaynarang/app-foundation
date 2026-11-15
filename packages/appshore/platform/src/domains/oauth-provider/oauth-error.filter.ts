import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { errorShapeOf, buildErrorEnvelope } from '../../shared/filters/error-envelope';

/** RFC 6749 §5.2 / §4.1.2.1 and RFC 7591 §3.2.2 error codes this server answers with. */
export const OAUTH_ERROR = {
  INVALID_REQUEST: 'invalid_request',
  INVALID_CLIENT: 'invalid_client',
  INVALID_GRANT: 'invalid_grant',
  UNAUTHORIZED_CLIENT: 'unauthorized_client',
  UNSUPPORTED_GRANT_TYPE: 'unsupported_grant_type',
  UNSUPPORTED_RESPONSE_TYPE: 'unsupported_response_type',
  INVALID_SCOPE: 'invalid_scope',
  ACCESS_DENIED: 'access_denied',
  SERVER_ERROR: 'server_error',
  TEMPORARILY_UNAVAILABLE: 'temporarily_unavailable',
  INVALID_REDIRECT_URI: 'invalid_redirect_uri',
  INVALID_CLIENT_METADATA: 'invalid_client_metadata',
} as const;
export type OAuthErrorCode = (typeof OAUTH_ERROR)[keyof typeof OAUTH_ERROR];

/**
 * An OAuth protocol error. On an OAuth route (OAuthErrorFilter) it answers `{ error, error_description }`; anywhere
 * else the global filter reads `detail`, so the same throw is safe from either side.
 */
export function oauthError(
  error: OAuthErrorCode,
  description: string,
  status: HttpStatus.BAD_REQUEST | HttpStatus.UNAUTHORIZED = HttpStatus.BAD_REQUEST,
): HttpException {
  const body = { error, error_description: description, detail: description, message: description };
  return status === HttpStatus.UNAUTHORIZED ? new UnauthorizedException(body) : new BadRequestException(body);
}

const RFC_CODE = /^[a-z][a-z_]*$/;

function codeFor(status: number): OAuthErrorCode {
  if (status === HttpStatus.UNAUTHORIZED) return OAUTH_ERROR.INVALID_CLIENT;
  if (status === HttpStatus.FORBIDDEN) return OAUTH_ERROR.ACCESS_DENIED;
  if (status === HttpStatus.TOO_MANY_REQUESTS || status === HttpStatus.SERVICE_UNAVAILABLE) {
    return OAUTH_ERROR.TEMPORARILY_UNAVAILABLE;
  }
  if (status >= 500) return OAUTH_ERROR.SERVER_ERROR;
  return OAUTH_ERROR.INVALID_REQUEST;
}

/**
 * Errors on the OAuth protocol endpoints (`/oauth/authorize`, `/oauth/token`, `/oauth/revoke`, `/oauth/register`)
 * in the shape the standards define — `{ error, error_description }` (RFC 6749 §5.2, RFC 7591 §3.2.2), never the
 * app envelope (ADR "API contract", section 2). OAuth clients (Claude, ChatGPT, MCP SDKs) parse these fields. An explicit RFC code
 * on the exception wins; otherwise the code follows the status. Applied per route with `@UseFilters` — the consent
 * route the web app calls keeps the envelope.
 */
@Catch()
export class OAuthErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    if (res.headersSent) return;
    const req = http.getRequest<Request>();

    buildErrorEnvelope(exception, req); // the same logging as every other error
    const shape = errorShapeOf(exception);
    const stated =
      exception instanceof HttpException ? (exception.getResponse() as { error?: unknown }).error : undefined;
    const error = typeof stated === 'string' && RFC_CODE.test(stated) ? stated : codeFor(shape.status);

    res.setHeader('Cache-Control', 'no-store');
    res.status(shape.status).json({ error, error_description: shape.detail });
  }
}

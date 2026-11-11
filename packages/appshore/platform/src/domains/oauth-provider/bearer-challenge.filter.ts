import { ArgumentsHost, Catch, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { HttpExceptionFilter } from '../../shared/filters/http-exception.filter';
import { resolveOAuthIssuer } from './oauth-settings';

/** Where the RFC 9728 protected-resource document is served, relative to the issuer (see the backend's `main.ts`). */
export const PROTECTED_RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource';

/**
 * RFC 6750 section 3 + RFC 9728 section 5.1 challenge for a 401 from a protected resource. `error="invalid_token"`
 * only when the request carried credentials: a first, token-less discovery call gets the bare challenge
 * (RFC 6750 section 3.1).
 */
export function bearerChallenge(resourceMetadataUrl: string, presentedCredentials: boolean): string {
  const error = presentedCredentials ? 'error="invalid_token", ' : '';
  return `Bearer ${error}resource_metadata="${resourceMetadataUrl}"`;
}

/**
 * A 401 from a bearer-protected agent route (OAuth token or API key) tells the client where to authenticate:
 * RFC 6750 `WWW-Authenticate: Bearer` with the RFC 9728 `resource_metadata` URL. MCP clients start OAuth discovery
 * from this header. The body is the usual error envelope (this extends the global filter). Apply it with
 * `@UseFilters(BearerChallengeFilter)` on a controller whose routes take an API key or an OAuth token.
 */
@Injectable()
@Catch(UnauthorizedException)
export class BearerChallengeFilter extends HttpExceptionFilter {
  private readonly resourceMetadataUrl: string;

  constructor(config: ConfigService) {
    super();
    // The issuer is the protected resource in the template: one origin serves the API, the MCP endpoints and
    // the metadata documents.
    const issuer = resolveOAuthIssuer((key) => config.get<string>(key));
    this.resourceMetadataUrl = `${issuer}${PROTECTED_RESOURCE_METADATA_PATH}`;
  }

  catch(exception: UnauthorizedException, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    res.setHeader('WWW-Authenticate', bearerChallenge(this.resourceMetadataUrl, Boolean(req.headers.authorization)));
    super.catch(exception, host);
  }
}

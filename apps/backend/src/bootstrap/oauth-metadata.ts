import type { NextFunction, Request, Response } from 'express';
import { OAUTH_SCOPES } from '@app/shared-types';

/** RFC 8414 authorization server metadata, at the well-known root (outside `/api/v1`). */
export const AUTHORIZATION_SERVER_METADATA_PATH = '/.well-known/oauth-authorization-server';
/** RFC 9728 protected resource metadata for the MCP endpoint (Claude.ai asks for it). */
export const PROTECTED_RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource';

type Middleware = (req: Request, res: Response, next: NextFunction) => void;
interface MountsMiddleware {
  use(path: string, handler: Middleware): unknown;
}

function sendJson(res: Response, body: unknown): void {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(body);
}

/** The RFC 8414 document for `issuer`, the one the token service signs into every access token. */
export function authorizationServerMetadata(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/api/v1/oauth/authorize`,
    token_endpoint: `${issuer}/api/v1/oauth/token`,
    registration_endpoint: `${issuer}/api/v1/oauth/register`,
    revocation_endpoint: `${issuer}/api/v1/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: [...OAUTH_SCOPES],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
  };
}

/** The RFC 9728 document for `issuer`. */
export function protectedResourceMetadata(issuer: string) {
  return {
    resource: issuer,
    authorization_servers: [issuer],
    scopes_supported: [...OAUTH_SCOPES],
  };
}

/**
 * The OAuth discovery documents, at the well-known root. They are Express middleware, not Nest routes, so the
 * document builder never sees them: `public-openapi.ts` declares them, and `public-openapi.spec.ts` holds those
 * declarations to what is served here.
 */
export function mountOAuthMetadata(app: MountsMiddleware, issuer: string): void {
  app.use(AUTHORIZATION_SERVER_METADATA_PATH, (_req, res) => sendJson(res, authorizationServerMetadata(issuer)));
  app.use(PROTECTED_RESOURCE_METADATA_PATH, (_req, res) => sendJson(res, protectedResourceMetadata(issuer)));
}

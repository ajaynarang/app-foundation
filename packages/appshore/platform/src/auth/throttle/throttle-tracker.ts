import { JwtService } from '@nestjs/jwt';
import { clientIp } from './client-ip';
import {
  resolveOAuthAccessTokenSecret,
  resolveOAuthIssuer,
  type SettingReader,
} from '../../domains/oauth-provider/oauth-settings';

interface TrackedRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

/**
 * Who a request is counted against at the edge (the global ThrottlerGuard runs before authentication):
 *
 * 1. a **verified** app session JWT → `user:<sub>`
 * 2. a **verified** OAuth access token (signature and `iss`) → `oauth:<clientId>:<sub>`, the client acting for
 *    that user
 * 3. anything else → `ip:<client ip>` (the real client, via `trust proxy`)
 *
 * A route that is public by design (`@Public()`: login, OTP, password reset, token endpoints) is always counted by
 * client IP, bearer or not. Those are the guessing targets, and a caller's own valid session must not buy a
 * separate allowance there: with N accounts one machine would get N times the login budget.
 *
 * Only cryptographic checks run here, no database. A forged, expired or random bearer never earns its own bucket;
 * it is counted against its IP. Otherwise anyone could pick a fresh bucket per request by changing the header, and
 * the limits on login and token endpoints would stop nothing. API keys need a database lookup to verify, so at the
 * edge they are counted by IP; the per-key limit is applied after the key is validated (`AgentRateLimitGuard`).
 */
export class ThrottleTracker {
  private readonly jwt = new JwtService();
  private readonly sessionSecret: string | undefined;
  private readonly oauthSecret: string;
  private readonly oauthIssuer: string;

  constructor(read: SettingReader) {
    this.sessionSecret = read('jwt.accessSecret');
    this.oauthSecret = resolveOAuthAccessTokenSecret(read);
    this.oauthIssuer = resolveOAuthIssuer(read);
  }

  resolve(req: TrackedRequest, route: { isPublic?: boolean } = {}): string {
    const token = route.isPublic ? null : bearerOf(req.headers.authorization);
    if (token) {
      const session = this.verify(token, { secret: this.sessionSecret });
      if (session?.sub !== undefined && session.clientId === undefined) return `user:${String(session.sub)}`;

      const oauth = this.verify(token, { secret: this.oauthSecret, issuer: this.oauthIssuer });
      if (oauth?.sub !== undefined && typeof oauth.clientId === 'string') {
        return `oauth:${oauth.clientId}:${String(oauth.sub)}`;
      }
    }
    return `ip:${clientIp(req)}`;
  }

  private verify(
    token: string,
    options: { secret?: string; issuer?: string },
  ): { sub?: unknown; clientId?: unknown } | null {
    if (!options.secret) return null;
    try {
      return this.jwt.verify<{ sub?: unknown; clientId?: unknown }>(token, options);
    } catch {
      return null;
    }
  }
}

function bearerOf(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith('Bearer ')) return null;
  const token = value.slice('Bearer '.length).trim();
  // A JWT has three dot-separated parts; API keys and junk skip the HMAC work entirely.
  return token.split('.').length === 3 ? token : null;
}

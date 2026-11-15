import type { CookieOptions, Response } from 'express';
import {
  REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_PATH,
} from '../constants/auth.constants';

export interface RefreshTokenCookieContext {
  /** Send the cookie over HTTPS only. True in production. */
  secure: boolean;
  /**
   * The value of COOKIE_DOMAIN, if a deployment still sets it. Earlier versions
   * issued the cookie with this `Domain`; it is used here only to expire those
   * cookies, never to set one.
   */
  legacyDomain?: string;
}

/**
 * The refresh cookie is host-only: it carries NO `Domain` attribute, so the
 * browser sends it back to the API host that set it and to nothing else.
 *
 * A `Domain` (e.g. `.example.com`) would hand the refresh token to every
 * subdomain: each tenant subdomain and any other app hosted under the same
 * parent. The cookie is only ever read by the API (refresh and logout), so no
 * other host needs it. A `Domain` also breaks outright when the API runs on a
 * host outside it: the browser drops the cookie and sessions end when the
 * access token expires.
 */
function hostOnlyOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: REFRESH_TOKEN_COOKIE_PATH,
  };
}

/**
 * A cookie set with a `Domain` is a different cookie from the host-only one,
 * with the same name. Left in place, the browser sends both and the older one
 * wins, so it is expired whenever the host-only cookie is written or cleared.
 */
function expireLegacyDomainCookie(response: Response, { secure, legacyDomain }: RefreshTokenCookieContext): void {
  if (!legacyDomain) return;
  response.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { ...hostOnlyOptions(secure), domain: legacyDomain });
}

export function setRefreshTokenCookie(
  response: Response,
  refreshToken: string,
  context: RefreshTokenCookieContext,
): void {
  expireLegacyDomainCookie(response, context);
  response.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    ...hostOnlyOptions(context.secure),
    maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
  });
}

/** Must mirror `setRefreshTokenCookie` so the cleared cookie is the one the browser stored. */
export function clearRefreshTokenCookie(response: Response, context: RefreshTokenCookieContext): void {
  expireLegacyDomainCookie(response, context);
  response.clearCookie(REFRESH_TOKEN_COOKIE_NAME, hostOnlyOptions(context.secure));
}

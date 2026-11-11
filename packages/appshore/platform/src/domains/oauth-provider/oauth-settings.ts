/**
 * The OAuth provider's signing secrets and issuer, resolved in one place so the token service, the JWT module
 * and the edge throttle tracker can never disagree about them. The keys are the app's config keys
 * (`apps/backend/src/config/configuration.ts`), where production refuses to boot on a missing or default value.
 */

/** Reads one config value (`ConfigService.get`). */
export type SettingReader = (key: string) => string | undefined;

/** HMAC secret that signs OAuth access tokens. Outside production it may be derived from `secretKey`. */
export function resolveOAuthAccessTokenSecret(read: SettingReader): string {
  return read('oauthJwtSecret') || `${read('secretKey')}-oauth`;
}

/**
 * HMAC secret that signs consent challenges. It is never the access-token secret, so a consent challenge
 * can never verify as an access token (and the reverse). Outside production it may be derived from `secretKey`.
 */
export function resolveOAuthConsentSecret(read: SettingReader): string {
  return read('oauthConsentSecret') || `${read('secretKey')}-oauth-consent`;
}

/**
 * The `iss` of every access token and the issuer in the RFC 8414 metadata. Required config: there is no
 * fallback here, because a token signed for a made-up issuer verifies nowhere a client would look.
 */
export function resolveOAuthIssuer(read: SettingReader): string {
  const issuer = read('oauthIssuer')?.trim();
  if (!issuer) {
    throw new Error('oauthIssuer config is required (set OAUTH_ISSUER to the public URL of this API)');
  }
  return issuer.replace(/\/+$/, '');
}

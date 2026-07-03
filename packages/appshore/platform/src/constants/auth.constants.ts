/**
 * Authentication & rate-limiting constants.
 * Used in auth.controller.ts throttle decorators and cookie configuration.
 */

// ─── Throttle configuration ────────────────────────────────────────────────────

/** 15 minutes in milliseconds — TTL window for auth rate limiting */
export const AUTH_THROTTLE_TTL_MS = 900_000;

/** Max attempts for sensitive operations (password change, OTP verify, phone login) */
export const AUTH_THROTTLE_LIMIT_STRICT = 5;

/** Max attempts for OTP send (slightly relaxed for resend scenarios) */
export const AUTH_THROTTLE_LIMIT_OTP_SEND = 10;

// ─── Token / cookie durations ───────────────────────────────────────────────────

/** 7 days in milliseconds — refresh token cookie maxAge */
export const REFRESH_TOKEN_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Cookie name for refresh token */
export const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';

/** Cookie path for auth endpoints */
export const REFRESH_TOKEN_COOKIE_PATH = '/api/v1/auth';

// ─── Invitation ────────────────────────────────────────────────────────────────

/** 7 days in milliseconds — user invitation expiry */
export const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

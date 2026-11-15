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

/**
 * Max calls per client IP for the public invitation token routes (`preview`, `accept`). A token is about 165 bits, so
 * this bounds a client, not a guesser; it leaves room for a person who reloads the acceptance page and for two runs
 * of the API QA suite inside one window.
 */
export const AUTH_THROTTLE_LIMIT_TOKEN = 20;

// ─── Token / cookie durations ───────────────────────────────────────────────────

/** 7 days in milliseconds — refresh token cookie maxAge */
export const REFRESH_TOKEN_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Cookie name for refresh token */
export const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';

/** Cookie path for auth endpoints */
export const REFRESH_TOKEN_COOKIE_PATH = '/api/v1/auth';

// ─── Email verification ─────────────────────────────────────────────────────────

/** 24 hours in milliseconds — how long an emailed verification link works */
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

/** 60 seconds in milliseconds — the least time between two verification emails for one account */
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;

// ─── Invitation ────────────────────────────────────────────────────────────────

/** 7 days in milliseconds — user invitation expiry */
export const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

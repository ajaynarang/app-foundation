import { parseEnvType } from '../../shared/utils/env-label';

/**
 * Outbound gate mode (ADR "Outbound gate").
 *
 * - `live`: email, SMS, push, WhatsApp and customer webhooks go to their real recipients.
 * - `allowlist`: only recipients on the allow-list (the `outbound_allow_entries` table plus
 *   `OUTBOUND_ALLOWLIST_BOOTSTRAP`) are messaged; everything else is held back and recorded. An empty list sends
 *   nothing.
 *
 * Unset means `live` when `ENV_TYPE=production` (a missing key must not silence real customers) and `allowlist` in
 * every other environment (a missing key must not message them from a test environment).
 */
export const OUTBOUND_MODE = {
  LIVE: 'live',
  ALLOWLIST: 'allowlist',
} as const;

export type OutboundMode = (typeof OUTBOUND_MODE)[keyof typeof OUTBOUND_MODE];

export const OUTBOUND_MODE_ENV = 'OUTBOUND_MODE';
/** Explicit acknowledgement that a non-production environment serves real people (a pre-cutover staging). */
export const OUTBOUND_LIVE_OUTSIDE_PRODUCTION_ENV = 'OUTBOUND_LIVE_OUTSIDE_PRODUCTION';
/** A comma list of emails, `@domains`, phone numbers and webhook hosts merged into the allow set. */
export const OUTBOUND_ALLOWLIST_BOOTSTRAP_ENV = 'OUTBOUND_ALLOWLIST_BOOTSTRAP';

const MODES: readonly string[] = Object.values(OUTBOUND_MODE);

type Env = Record<string, string | undefined>;

/** Production means `ENV_TYPE=production` and nothing else; an unset `ENV_TYPE` (a unit test, a script) is not. */
function isProduction(env: Env): boolean {
  return parseEnvType(env.ENV_TYPE) === 'production';
}

export function resolveOutboundMode(env: Env = process.env): OutboundMode {
  const raw = env[OUTBOUND_MODE_ENV]?.trim().toLowerCase();
  if (raw) {
    if (!MODES.includes(raw)) {
      throw new Error(`${OUTBOUND_MODE_ENV} must be one of: ${MODES.join(' | ')} (got "${raw}")`);
    }
    return raw as OutboundMode;
  }
  return isProduction(env) ? OUTBOUND_MODE.LIVE : OUTBOUND_MODE.ALLOWLIST;
}

/**
 * Refuses an outbound configuration that could message the wrong people. Called from the config schema's
 * `superRefine`, so a bad value stops the boot with the other config errors.
 */
export function assertOutboundSafety(env: Env = process.env): void {
  const mode = resolveOutboundMode(env);
  const production = isProduction(env);

  if (production && mode !== OUTBOUND_MODE.LIVE) {
    throw new Error(
      `Refusing to start: production must run with ${OUTBOUND_MODE_ENV}=live; "${mode}" would hold back every customer message.`,
    );
  }

  if (!production && mode === OUTBOUND_MODE.LIVE && env[OUTBOUND_LIVE_OUTSIDE_PRODUCTION_ENV]?.trim() !== 'true') {
    throw new Error(
      `Refusing to start: ${OUTBOUND_MODE_ENV}=live outside production would message real people from a test environment. ` +
        `Use ${OUTBOUND_MODE_ENV}=allowlist, or set ${OUTBOUND_LIVE_OUTSIDE_PRODUCTION_ENV}=true only while this environment serves real people.`,
    );
  }
}

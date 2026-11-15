/**
 * The environment vocabulary every observability surface reports.
 *
 * Dependency-free on purpose: the log transport and telemetry read this before Nest boots (and before the OTel SDK
 * patches anything), so it imports nothing and never throws.
 */

export type EnvType = 'production' | 'sandbox' | 'preprod' | 'development';

export const ALLOWED_ENV_TYPES: readonly EnvType[] = ['production', 'sandbox', 'preprod', 'development'];

/**
 * The one name the Loki `env` label, OTel `deployment.environment`, Sentry `environment` and the web marker use, so
 * a single `env="staging"` filter covers logs, traces and errors. `NODE_ENV` is never the source: every deployed task
 * runs with `NODE_ENV=production`, staging included.
 */
export type ObservabilityEnv = 'production' | 'staging' | 'development';

export const OBSERVABILITY_ENV_BY_ENV_TYPE: Record<EnvType, ObservabilityEnv> = {
  production: 'production',
  sandbox: 'staging',
  preprod: 'staging',
  development: 'development',
};

/**
 * Read a raw `ENV_TYPE` without throwing. The deprecated `ENV_TYPE=staging` reads as sandbox, exactly as
 * `getEnvType()` does; an unset or unrecognised value is `undefined`.
 */
export function parseEnvType(raw: string | undefined): EnvType | undefined {
  const normalized = raw?.trim().toLowerCase();
  const envType = normalized === 'staging' ? 'sandbox' : normalized;
  return envType && (ALLOWED_ENV_TYPES as readonly string[]).includes(envType) ? (envType as EnvType) : undefined;
}

/** Non-throwing `ENV_TYPE` → observability label; anything unrecognised is `unknown`. */
export function resolveObservabilityEnv(raw: string | undefined): ObservabilityEnv | 'unknown' {
  const envType = parseEnvType(raw);
  return envType ? OBSERVABILITY_ENV_BY_ENV_TYPE[envType] : 'unknown';
}

/**
 * True only for `ENV_TYPE=development`: a developer's own machine. Read on every call (not cached), and an unset value
 * (a unit test, a script) is not development, so anything this unlocks (printing an email body, skipping the queue
 * board's auth) stays locked unless someone asked for it.
 */
export function isDevelopmentEnv(raw: string | undefined = process.env.ENV_TYPE): boolean {
  return parseEnvType(raw) === 'development';
}

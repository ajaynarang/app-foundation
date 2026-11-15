/** Which deployment this build is. The same three names the backend, the Loki `env` label and Sentry report. */
export type AppEnvironment = 'production' | 'staging' | 'development';

const APP_ENVIRONMENTS: readonly AppEnvironment[] = ['production', 'staging', 'development'];

/**
 * Reads `NEXT_PUBLIC_APP_ENV`, which Next.js inlines at build time, so this is safe on the server and the client.
 * Unset or unrecognised is `development`: a build has to say it is production or staging.
 */
export function resolveAppEnvironment(raw: string | undefined = process.env.NEXT_PUBLIC_APP_ENV): AppEnvironment {
  const value = raw?.trim().toLowerCase();
  return (APP_ENVIRONMENTS as readonly string[]).includes(value ?? '') ? (value as AppEnvironment) : 'development';
}

import type { TransportMultiOptions, TransportSingleOptions, TransportTargetOptions } from 'pino';
import { resolveObservabilityEnv } from '../../shared/utils/env-label';

const DEV_LOKI_URL = 'http://localhost:3100';

/**
 * Build the pino transport from env.
 *
 *   - `LOG_TRANSPORT=loki` + dev     → pino-pretty (terminal) + pino-loki (local stack)
 *   - `LOG_TRANSPORT=loki` + non-dev → JSON to stdout + pino-loki (Grafana Cloud)
 *   - `NODE_ENV=development`         → pino-pretty
 *   - otherwise                      → undefined (pino's default: JSON to stdout)
 *
 * Outside dev the Loki branch always tees: stdout feeds the CloudWatch
 * break-glass copy (boot output, crashes), so it must never be traded for Loki.
 * Outside dev an unset `LOKI_URL` means no Loki target — there is no localhost
 * collector in ECS to fall back to; one stderr line at boot says so.
 *
 * Labels stay low-cardinality: `service`, `env` (ENV_TYPE mapped to
 * staging / production / development, the same names Sentry reports — never
 * NODE_ENV, which is `production` on staging too), plus the `level` and `hostname` labels pino-loki
 * adds itself. tenantId, requestId and the rest stay in the JSON body.
 *
 * Loki is best-effort: `silenceErrors` keeps a Loki outage from spamming
 * stdout, and the stdout/pretty target keeps working regardless.
 */
export function buildPinoTransport(): TransportSingleOptions | TransportMultiOptions | undefined {
  const isDev = process.env.NODE_ENV === 'development';
  const wantsLoki = process.env.LOG_TRANSPORT?.trim().toLowerCase() === 'loki';
  const lokiUrl = process.env.LOKI_URL?.trim() || (isDev ? DEV_LOKI_URL : undefined);

  const pretty: TransportTargetOptions = {
    target: 'pino-pretty',
    options: { colorize: true, singleLine: true },
  };

  if (wantsLoki && lokiUrl) {
    // pino multistream defaults a target without `level` to info, which would
    // silently cap a root LOG_LEVEL of debug/trace. Every target mirrors the
    // root level (same expression as LoggerModule in app.module.ts).
    const level = process.env.LOG_LEVEL?.toLowerCase() ?? 'info';
    const consoleTarget: TransportTargetOptions = isDev ? pretty : { target: 'pino/file', options: { destination: 1 } };
    return { targets: [consoleTarget, buildLokiTarget(lokiUrl)].map((target) => ({ ...target, level })) };
  }

  if (wantsLoki) {
    // Half-configured env (Doppler keys land one at a time): say so once at
    // boot, otherwise Loki silently receives nothing.
    process.stderr.write('[logging] LOG_TRANSPORT=loki but LOKI_URL is empty; Loki shipping disabled\n');
  }

  return isDev ? pretty : undefined;
}

function buildLokiTarget(host: string): TransportTargetOptions {
  const username = process.env.LOKI_USERNAME?.trim();
  const password = process.env.LOKI_PASSWORD?.trim();

  return {
    target: 'pino-loki',
    options: {
      host,
      batching: { interval: 2 },
      labels: {
        service: process.env.OTEL_SERVICE_NAME?.trim() || 'app-backend',
        env: resolveObservabilityEnv(process.env.ENV_TYPE),
      },
      ...(username && password ? { basicAuth: { username, password } } : {}),
      silenceErrors: true,
    },
  };
}

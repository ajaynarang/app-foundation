import type { TransportMultiOptions, TransportSingleOptions } from 'pino';

/**
 * Build the pino transport based on env.
 *
 * Modes:
 *   - `LOG_TRANSPORT=loki` + dev    → pino-pretty (terminal) + pino-loki (browser)
 *   - `LOG_TRANSPORT=loki` + prod   → pino-loki only (JSON stays on stdout via fallback)
 *   - `NODE_ENV=development`        → pino-pretty (current default)
 *   - otherwise                     → undefined (raw JSON to stdout)
 *
 * The Loki transport is best-effort — if Loki is down it logs a warning once
 * and the pretty/stdout branch still works, so dev never blocks on infra.
 */
export function buildPinoTransport(): TransportSingleOptions | TransportMultiOptions | undefined {
  const transport = process.env.LOG_TRANSPORT?.toLowerCase();
  const isDev = process.env.NODE_ENV === 'development';
  const lokiUrl = process.env.LOKI_URL ?? 'http://localhost:3100';
  const serviceName = process.env.OTEL_SERVICE_NAME ?? 'app-backend';

  // Target-level `level` is intentionally omitted — the parent LoggerModule
  // already reads LOG_LEVEL from env. Duplicating it here would create two
  // knobs for the same thing (and pino can only narrow, not widen, from the
  // parent level anyway).
  const pretty = {
    target: 'pino-pretty',
    options: { colorize: true, singleLine: true },
  };

  const loki = {
    target: 'pino-loki',
    options: {
      host: lokiUrl,
      batching: true,
      interval: 2,
      labels: { service: serviceName, env: process.env.NODE_ENV ?? 'unknown' },
      propsToLabels: ['level'],
      // silenceErrors keeps dev quiet when the observability stack isn't up
      silenceErrors: true,
    },
  };

  if (transport === 'loki') {
    return {
      targets: isDev ? [pretty, loki] : [loki],
    };
  }

  if (isDev) {
    return pretty;
  }

  return undefined;
}

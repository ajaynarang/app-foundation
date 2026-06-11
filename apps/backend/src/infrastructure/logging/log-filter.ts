/**
 * Centralized HTTP request log filtering.
 *
 * Add path prefixes to SILENT_PREFIXES to suppress logging for noisy
 * endpoints (SSE reconnects, health probes, etc.). This single list
 * is used by both pino-http (autoLogging) and HttpExceptionFilter.
 *
 * To silence a new endpoint, just add it here — no other file changes needed.
 *
 * NOTE: Filtering only applies in development. In production all requests
 * are logged so nothing is hidden from observability tooling.
 */

import { IncomingMessage } from 'http';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Path prefixes whose requests should NOT be logged in development.
 * Add new entries here as needed.
 */
const SILENT_PREFIXES: string[] = ['/api/v1/sse/', '/api/v1/health/'];

/**
 * Check a URL string against the silent list.
 * Returns true only in development for matching paths.
 * Used by HttpExceptionFilter.
 */
export function isSilentPath(url: string): boolean {
  return isDev && SILENT_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/**
 * pino-http autoLogging ignore callback.
 * Usage: autoLogging: { ignore: shouldSkipRequestLog }
 */
export function shouldSkipRequestLog(req: IncomingMessage): boolean {
  return isSilentPath(req.url ?? '');
}

/**
 * Mask credential-bearing query params before a URL is written to logs.
 * SSE/EventSource clients cannot send an Authorization header, so they pass
 * the access token as `?token=` — without masking, every SSE connect would
 * write a valid bearer token into the log pipeline.
 */
export function maskUrlSecrets(url: string | undefined): string {
  if (!url) return '';
  return url.replace(/([?&]token=)[^&]+/gi, '$1[REDACTED]');
}

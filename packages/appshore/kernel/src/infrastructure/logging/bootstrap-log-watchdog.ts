import { Logger } from '@nestjs/common';

/** How long a bootstrap may take before its buffered logs are released anyway. */
export const BOOTSTRAP_LOG_WATCHDOG_MS = 90_000;

/**
 * `bufferLogs: true` holds every Nest log until the app is created, so the
 * startup lines come out through pino in one consistent format. If creation
 * never finishes, nothing is ever written and the buffer grows without bound.
 * This watchdog flushes the buffer to stdout once the deadline passes, which
 * also turns buffering off, and names the stall so it is visible in the logs.
 *
 * Call the returned function once the app is created to disarm it.
 */
export function armBootstrapLogWatchdog(processName: string, timeoutMs = BOOTSTRAP_LOG_WATCHDOG_MS): () => void {
  const timer = setTimeout(() => {
    Logger.flush();
    new Logger('Bootstrap').error(
      `${processName} has not finished starting after ${timeoutMs / 1000}s — a module init hook is likely stuck. Releasing buffered logs.`,
    );
  }, timeoutMs);
  timer.unref();
  return () => clearTimeout(timer);
}

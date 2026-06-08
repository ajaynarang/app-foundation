/**
 * Format a duration in milliseconds to a human-readable string.
 * - < 1s: "123ms"
 * - < 1m: "4.5s"
 * - >= 1m: "2m 15s"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

/**
 * Calculate duration between two timestamps. Returns human-readable string.
 * If completedAt is not provided, measures to now (for in-progress jobs).
 */
export function formatDurationBetween(startedAt?: string | null, completedAt?: string | null): string {
  if (!startedAt) return '-';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  return formatDuration(end - start);
}

/**
 * Short, monospace-friendly label for a job's numeric ID — e.g. `#48414`.
 * The `jobs` table uses an Int PK, so we render the full id with a `#` prefix
 * rather than slicing characters off a string.
 */
export function formatJobLabel(id: number): string {
  return `#${id}`;
}

import { randomBytes } from 'node:crypto';

let counter = 0;

/**
 * Generate a unique-per-call identifier suitable for test payloads.
 *
 * Collision-resistant across Playwright worker processes:
 *   - `Date.now()` differentiates across milliseconds.
 *   - Per-process `++counter` differentiates within the same millisecond.
 *   - 6 hex chars from `crypto.randomBytes(3)` differentiate across workers
 *     that hit the same millisecond with counter=1 in each.
 */
export function unique(prefix: string): string {
  const rand = randomBytes(3).toString('hex');
  return `${prefix}-test-${Date.now()}-${++counter}-${rand}`;
}

export function futureDate(daysFromNow: number): string {
  const d = new Date(Date.now() + daysFromNow * 86_400_000);
  return d.toISOString().split('T')[0];
}

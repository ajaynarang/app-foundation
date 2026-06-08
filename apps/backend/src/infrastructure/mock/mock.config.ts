/**
 * Mock Mode Configuration
 *
 * Single env var `MOCK_MODE` controls what subsystems return mock data.
 *
 * Accepted values (comma-separated):
 *   - `off`  — no mocks (production default)
 *   - `tms`  — mock TMS adapters (McLeod, Project44)
 *   - `dat`  — mock DAT load-board
 *   - `all`  — mock everything current and future
 *
 * Examples:
 *   MOCK_MODE=off          // everything real
 *   MOCK_MODE=all          // everything mocked (dev default)
 *   MOCK_MODE=tms          // only TMS mocked
 *   MOCK_MODE=tms,dat      // both mocked (same as all today)
 *
 * Grep for `isMockModeFor(...)` to see what's still mocked.
 */

export type MockSubsystem = 'tms' | 'dat';

/**
 * Returns true if the given subsystem should return mock data.
 * Reads process.env at call time so tests can override per-test.
 */
export function isMockModeFor(subsystem: MockSubsystem): boolean {
  const raw = (process.env.MOCK_MODE || 'off').toLowerCase();
  const tokens = raw.split(',').map((t) => t.trim());
  return tokens.includes('all') || tokens.includes(subsystem);
}

/**
 * Module-load snapshot, useful for callers that don't need runtime mutability.
 * Tests that need to flip mock mode mid-run should use `isMockModeFor()` directly.
 */
export const MOCK_TMS = isMockModeFor('tms');
export const MOCK_DAT = isMockModeFor('dat');

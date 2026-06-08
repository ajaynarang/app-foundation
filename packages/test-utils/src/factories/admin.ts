/**
 * Factories for the super-admin platform-infrastructure surface
 * (Phase 7).
 *
 * Mirror the class-validator DTOs on
 * `apps/backend/src/domains/admin/dto/*` exactly — missing required
 * fields or out-of-enum values trip the DTO layer with a 400 before
 * the service runs.
 *
 * Group 7a covers cache-flush + schedule-patch payloads. Group 7b/7c
 * extend this file with admin-jobs + platform-health DTOs.
 */

/**
 * `POST /admin/cache/flush` body — admin-cache.controller.ts:48-57.
 *
 * Only one field on the wire (`confirm`). The 400 guard fires when
 * `confirm !== true`. Default is the safe happy-path (`confirm: true`).
 * Tests asserting the guard pass `{ confirm: false }` or `{}` —
 * use `buildFlushCacheBody({ confirm: false })` for the latter.
 */
export function buildFlushCacheBody(overrides: { confirm?: boolean } = {}) {
  return {
    confirm: true as const,
    ...overrides,
  };
}

/**
 * `PATCH /admin/schedules/:id` body — UpdateScheduleDto
 * (apps/backend/src/domains/admin/dto/update-schedule.dto.ts).
 *
 * All three fields are optional but at least one should be set for
 * the patch to be meaningful. Default flips `isEnabled` — least
 * destructive, fully reversible in `afterEach`.
 *
 * If `pattern` is supplied it must be a valid cron expression
 * (validated by `IsCronExpression` constraint). `intervalMs` is
 * 10000..86400000 inclusive.
 */
export function buildUpdateSchedule(
  overrides: {
    pattern?: string;
    intervalMs?: number;
    isEnabled?: boolean;
  } = {},
) {
  return {
    isEnabled: false as boolean,
    ...overrides,
  };
}

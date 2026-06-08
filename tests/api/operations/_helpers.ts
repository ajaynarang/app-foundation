/**
 * Shared setup helpers for the Phase 3 operations spec suite. Underscore
 * prefix keeps this out of Playwright's default spec collector.
 *
 * Every helper follows the `tests/api/financials/_helpers.ts` convention:
 * typed return shape, and — when a precondition can't be bootstrapped —
 * throw a clear error that names the `@requires:data-<kind>` tag the caller
 * should apply. Never return "skip-me" sentinels.
 *
 * Shield-specific seeders live in `./_shield-helpers.ts`; the delivered-load
 * walk lives in `./_load-helpers.ts`.
 */
import { expect } from '@playwright/test';
import type { RoleApiClient } from '@sally/test-utils/playwright';
import { buildShiftNote, buildSupportTicket } from '@sally/test-utils/factories';

// ── seedAlert ──────────────────────────────────────────────────────────────────

export interface SeededAlert {
  alertId: string;
  /** The status the helper observed. Always OPEN for this seed path. */
  status: string;
}

/**
 * Pick a single active alert from the tenant. Alerts are rule-emitted (no
 * public POST /alerts), so when none exist, throws clearly so the caller
 * can tag `@requires:data-open-alert`.
 */
export async function seedAlert(asDispatcher: RoleApiClient): Promise<SeededAlert> {
  const res = await asDispatcher.get('/alerts?status=active&limit=1');
  expect(res.status(), 'GET /alerts bootstrap precondition should not fail').toBe(200);
  const body = (await res.json()) as unknown;
  const list = Array.isArray(body) ? (body as Array<{ alertId?: string; status?: string }>) : [];
  const picked = list[0];
  if (!picked?.alertId) {
    throw new Error(
      'seedAlert: no OPEN alert on tenant — tag test @requires:data-open-alert ' +
        '(seed demo-northstar to populate alerts, or wait for a monitoring cycle)',
    );
  }
  return { alertId: picked.alertId, status: picked.status ?? 'active' };
}

// ── seedRoutePlan ─────────────────────────────────────────────────────────────

export interface SeededRoutePlan {
  planId: string;
  driverPublicId: string;
  /** Optional — the first load attached to the plan (for monitoring replays). */
  loadId?: string;
  /** Optional — the first pickup/delivery segment id on the plan. */
  segmentId?: string;
}

/**
 * Pick an ACTIVE RoutePlan. Plan generation is `smart_routes`-gated +
 * asynchronous, so this helper picks from existing plans. When none exist,
 * throws so the caller tags `@requires:data-active-route-plan`.
 */
export async function seedRoutePlan(asDispatcher: RoleApiClient, _asAdmin: RoleApiClient): Promise<SeededRoutePlan> {
  const res = await asDispatcher.get('/route-plans?status=active&limit=1');
  if (res.status() === 404) {
    throw new Error(
      'seedRoutePlan: /route-plans endpoint not reachable — ' +
        'tag test @requires:data-active-route-plan (smart_routes plan gate)',
    );
  }
  if (res.status() !== 200) {
    const text = await res.text().catch(() => '');
    throw new Error(`seedRoutePlan: GET /route-plans → HTTP ${res.status()} ${text.slice(0, 240)}`);
  }
  const body = (await res.json()) as unknown;
  const list = Array.isArray(body)
    ? (body as Array<{
        planId?: string;
        driverId?: string;
        loads?: Array<{ loadId?: string }>;
        segments?: Array<{ segmentId?: string }>;
      }>)
    : ((body as { data?: Array<never> }).data ?? []);
  const picked = list[0];
  if (!picked?.planId || !picked.driverId) {
    throw new Error('seedRoutePlan: no ACTIVE RoutePlan on tenant — ' + 'tag test @requires:data-active-route-plan');
  }
  return {
    planId: picked.planId,
    driverPublicId: picked.driverId,
    loadId: picked.loads?.[0]?.loadId,
    segmentId: picked.segments?.[0]?.segmentId,
  };
}

// Shield-specific seeders (`seedShieldAudit`, `seedCustomRule`) live in
// `./_shield-helpers.ts` — split to keep this file under 250 LOC.

// ── seedShiftNote ─────────────────────────────────────────────────────────────

export interface SeededShiftNote {
  noteId: string;
}

/** Create a shift note owned by the current dispatcher. Caller owns cleanup. */
export async function seedShiftNote(asDispatcher: RoleApiClient): Promise<SeededShiftNote> {
  const res = await asDispatcher.post('/command-center/shift-notes', buildShiftNote());
  if (res.status() !== 201 && res.status() !== 200) {
    const text = await res.text().catch(() => '');
    throw new Error(`seedShiftNote: POST /command-center/shift-notes → HTTP ${res.status()} ${text.slice(0, 240)}`);
  }
  const body = (await res.json()) as { noteId?: string };
  if (!body.noteId) {
    throw new Error('seedShiftNote: response missing noteId');
  }
  return { noteId: body.noteId };
}

// ── seedIftaQuarter ───────────────────────────────────────────────────────────

export interface SeededIftaQuarter {
  quarterId: string;
  year: number;
  quarter: number;
  status: string;
}

/**
 * Pick the first OPEN IFTA quarter for the current year. Quarters are seeded
 * by a cron, not the API — throws so the caller can tag
 * `@requires:data-ifta-quarter` when none exist.
 */
export async function seedIftaQuarter(asAdmin: RoleApiClient): Promise<SeededIftaQuarter> {
  const year = new Date().getFullYear();
  const res = await asAdmin.get(`/ifta/quarters?year=${year}`);
  if (res.status() !== 200) {
    const text = await res.text().catch(() => '');
    throw new Error(`seedIftaQuarter: GET /ifta/quarters → HTTP ${res.status()} ${text.slice(0, 240)}`);
  }
  const body = (await res.json()) as unknown;
  const list = Array.isArray(body)
    ? (body as Array<{
        id?: string;
        year?: number;
        quarter?: number;
        status?: string;
      }>)
    : [];
  const picked = list.find((q) => q.status === 'OPEN') ?? list[0];
  if (!picked?.id || picked.year === undefined || picked.quarter === undefined) {
    throw new Error(
      'seedIftaQuarter: no IFTA quarter on tenant for year ' + year + ' — tag test @requires:data-ifta-quarter',
    );
  }
  return {
    quarterId: picked.id,
    year: picked.year,
    quarter: picked.quarter,
    status: picked.status ?? 'OPEN',
  };
}

// ── seedNotification ──────────────────────────────────────────────────────────

export interface SeededNotification {
  notificationId: string;
}

/**
 * Pick an existing UNREAD notification for the current user. No public POST
 * exists — throws so the caller can tag `@requires:data-in-app-notification`.
 */
export async function seedNotification(asDispatcher: RoleApiClient): Promise<SeededNotification> {
  const res = await asDispatcher.get('/notifications?status=UNREAD&limit=1');
  if (res.status() !== 200) {
    const text = await res.text().catch(() => '');
    throw new Error(`seedNotification: GET /notifications → HTTP ${res.status()} ${text.slice(0, 240)}`);
  }
  const body = (await res.json()) as unknown;
  const list = Array.isArray(body)
    ? (body as Array<{ notificationId?: string }>)
    : ((body as { data?: Array<{ notificationId?: string }> }).data ?? []);
  const picked = list[0];
  if (!picked?.notificationId) {
    throw new Error(
      'seedNotification: no UNREAD notification for current user — ' + 'tag test @requires:data-in-app-notification',
    );
  }
  return { notificationId: picked.notificationId };
}

// ── seedSupportTicket ─────────────────────────────────────────────────────────

export interface SeededSupportTicket {
  ticketId: number;
  ticketNumber: string;
}

/**
 * Create a support ticket. Returns the numeric ticket id that the super-admin
 * endpoints consume via ParseIntPipe. Caller cleans up via PUT admin endpoint.
 */
export async function seedSupportTicket(asDispatcher: RoleApiClient): Promise<SeededSupportTicket> {
  const res = await asDispatcher.post('/support/tickets', buildSupportTicket());
  if (res.status() !== 201 && res.status() !== 200) {
    const text = await res.text().catch(() => '');
    throw new Error(`seedSupportTicket: POST /support/tickets → HTTP ${res.status()} ${text.slice(0, 240)}`);
  }
  const body = (await res.json()) as {
    id?: number;
    ticketNumber?: string;
  };
  if (!body.id || !body.ticketNumber) {
    throw new Error('seedSupportTicket: response missing id/ticketNumber');
  }
  return { ticketId: body.id, ticketNumber: body.ticketNumber };
}

// Load-side bootstrapping helpers (`createDeliveredLoadForMonitoring`) live
// in `./_load-helpers.ts`. `firstCustomerId` is imported from
// `../financials/_helpers.js` at call sites directly.

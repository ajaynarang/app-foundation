/**
 * Shield-specific bootstrap helpers for the Phase 3 operations spec suite.
 * Split out of `_helpers.ts` to keep each file under the 250 LOC guideline.
 *
 * Underscore prefix hides this from Playwright's default spec collector.
 */
import type { RoleApiClient } from '@sally/test-utils/playwright';
import { buildCustomRulePayload, buildTriggerAuditPayload } from '@sally/test-utils/factories';

// ── seedShieldAudit ───────────────────────────────────────────────────────────

export interface SeededShieldAudit {
  auditId: string;
}

/**
 * Return a COMPLETED Shield audit id for the current tenant.
 *
 * Strategy:
 *   1. Read `GET /shield` — if `audit.status === 'COMPLETED'` is already
 *      present, return that id immediately (fastest path on populated
 *      tenants).
 *   2. Otherwise, POST /shield/audit to enqueue a fresh audit, then poll
 *      GET /shield until the latest completed audit post-dates the trigger
 *      timestamp (ensuring we pick the audit we just triggered, or any
 *      later one that rolled in meanwhile).
 *
 * Note: when the tenant already has an in-progress audit, POST returns the
 * running audit's id with `queued: false` — the service cannot enqueue a
 * parallel run. Polling GET /shield still finds the LATEST COMPLETED audit,
 * which is what the callers need (audit detail + PDF export work on any
 * completed audit).
 *
 * Callers MAY tag `@slow` when polling is expected. On timeout, throws so the
 * caller can tag `@requires:data-shield-audit` and skip at collection time.
 */
export async function seedShieldAudit(
  asDispatcher: RoleApiClient,
  options: { timeoutMs?: number } = {},
): Promise<SeededShieldAudit> {
  const timeoutMs = options.timeoutMs ?? 30000;

  // Fast path — existing completed audit.
  const firstRes = await asDispatcher.get('/shield');
  if (firstRes.status() === 200) {
    const firstBody = (await firstRes.json()) as {
      hasAudit?: boolean;
      audit?: { id?: string; status?: string };
    };
    if (firstBody.hasAudit && firstBody.audit?.status === 'COMPLETED' && firstBody.audit.id) {
      return { auditId: firstBody.audit.id };
    }
  }

  // Slow path — trigger a fresh audit and poll for a completed one.
  const triggerRes = await asDispatcher.post('/shield/audit', buildTriggerAuditPayload());
  if (triggerRes.status() !== 201 && triggerRes.status() !== 200) {
    const text = await triggerRes.text().catch(() => '');
    throw new Error(`seedShieldAudit: POST /shield/audit → HTTP ${triggerRes.status()} ${text.slice(0, 240)}`);
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const statusRes = await asDispatcher.get('/shield');
    if (statusRes.status() === 200) {
      const body = (await statusRes.json()) as {
        hasAudit?: boolean;
        audit?: { id?: string; status?: string };
      };
      if (body.hasAudit && body.audit?.status === 'COMPLETED' && body.audit.id) {
        return { auditId: body.audit.id };
      }
    }
    // 750ms between polls — fast enough to catch a 2s audit, slow enough
    // to not spam the API with dozens of GETs per test.
    await new Promise((r) => setTimeout(r, 750));
  }
  throw new Error(
    `seedShieldAudit: no COMPLETED audit visible within ` + `${timeoutMs}ms — tag test @requires:data-shield-audit`,
  );
}

// ── seedCustomRule ────────────────────────────────────────────────────────────

export interface SeededCustomRule {
  ruleId: string;
}

/**
 * Create a Shield custom rule owned by the current admin. Returns the string
 * `ruleId`. Caller owns cleanup — DELETE /shield/rules/:id in afterEach.
 */
export async function seedCustomRule(asAdmin: RoleApiClient): Promise<SeededCustomRule> {
  const res = await asAdmin.post('/shield/rules', buildCustomRulePayload());
  if (res.status() !== 201 && res.status() !== 200) {
    const text = await res.text().catch(() => '');
    throw new Error(`seedCustomRule: POST /shield/rules → HTTP ${res.status()} ${text.slice(0, 240)}`);
  }
  const body = (await res.json()) as { id?: string; ruleId?: string };
  const ruleId = body.id ?? body.ruleId;
  if (!ruleId) {
    throw new Error('seedCustomRule: response missing id/ruleId');
  }
  return { ruleId };
}

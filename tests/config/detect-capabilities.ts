/**
 * detect-capabilities.ts — Queries the plans API to determine which plan
 * features the target tenant has enabled, before test collection begins.
 *
 * Called synchronously from playwright.config.ts (top-level await on ESM config).
 * On any failure, defaults to "no capabilities known" so tests run without filtering.
 */

import { fetchDevUsers, switchToUser } from '@app/test-utils/auth';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TenantCapabilities {
  tenantId: string;
  planKey: string;
  /** Plan-entitlement feature keys that are enabled */
  enabledFeatures: string[];
  /** Plan-entitlement feature keys that are disabled */
  disabledFeatures: string[];
  generatedAt: string;
}

interface CapabilityResult {
  enabled: Set<string>;
  disabled: Set<string>;
}

// ── Detection ─────────────────────────────────────────────────────────────────

/**
 * Calls GET /plans/tenant/:tenantId with a super-admin token and returns the
 * sets of enabled and disabled plan feature keys.
 *
 * The feature keys are raw snake_case strings as stored in the
 * plan_entitlements table. Tags are formed as @requires:plan-<feature>.
 *
 * Bypassed entirely when ENABLE_ALL_TESTS=1.
 */
export async function detectCapabilities(baseUrl: string, tenantId: string): Promise<CapabilityResult> {
  // When ENABLE_ALL_TESTS is set, skip capability filtering so the full suite runs.
  if (process.env.ENABLE_ALL_TESTS === '1') {
    return { enabled: new Set<string>(), disabled: new Set<string>() };
  }

  const devUsers = await fetchDevUsers(baseUrl);
  const superAdmin = devUsers.superAdmins[0];
  if (!superAdmin) {
    throw new Error('No SUPER_ADMIN user available — run seed:base to create one');
  }

  const token = await switchToUser(baseUrl, superAdmin.userId);

  const res = await fetch(`${baseUrl}/plans/tenant/${tenantId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`GET /plans/tenant/${tenantId} returned HTTP ${res.status}`);
  }

  const body = (await res.json()) as {
    plan: string;
    planConfig: {
      plan: string;
      entitlements: Array<{ feature: string; enabled: boolean }>;
    } | null;
  };

  const entitlements = body?.planConfig?.entitlements ?? [];
  const enabled = new Set<string>();
  const disabled = new Set<string>();

  for (const e of entitlements) {
    (e.enabled ? enabled : disabled).add(e.feature);
  }

  return { enabled, disabled };
}

// ── Data capability detection ─────────────────────────────────────────────────

/**
 * Known data capabilities. A capability is "present" on a tenant if its key
 * appears in the TESTS_DATA_CAPABILITIES env var (comma-separated).
 *
 * Tests that need a data capability tag themselves `@requires:data-<kind>`
 * and are excluded from collection when the capability is absent — same
 * mechanism as plan gating, different tag prefix.
 *
 * Add a new entry when a new `@requires:data-*` tag is introduced. The list
 * exists only so typos in env vars or tags can be caught in review — it is
 * not enforced at runtime (unknown keys are simply treated as "absent").
 */
export const KNOWN_DATA_CAPABILITIES = [
  // ── Platform ──────────────────────────────────────────────────────────────
  'in-app-notification', // At least one UNREAD in-app notification owned by the
  // current user — notifications are system-generated, no public POST exists.
  'pending-tenant', // At least one Tenant with status=PENDING_APPROVAL exists.
  // Precondition for `POST /tenants/:tenantId/approve` (and `/reject`).
  // Flip on via `TESTS_DATA_CAPABILITIES=pending-tenant` after confirming
  // `GET /tenants?status=PENDING_APPROVAL` returns a non-empty list.
  'suspended-tenant', // At least one Tenant with status=SUSPENDED exists.
  // Precondition for `POST /tenants/:tenantId/reactivate`.
  'suspendable-tenant', // At least one non-critical ACTIVE tenant exists that
  // is safe to suspend+reactivate as part of a test (never the seeded demo
  // tenant). In practice: dedicated QA tenants seeded for this purpose.
  'assignable-tenant', // At least one non-demo, non-SUSPENDED, non-REJECTED
  // Tenant exists — precondition for `PATCH /plans/tenant/:tenantId`.
  'tenant-register-bypass', // Turnstile bot-verification is DISABLED for
  // `POST /tenants/register` (no `TURNSTILE_SECRET_KEY`, or a development
  // stub returns `success: true` for any token). Precondition for the
  // happy-path register test.
  // ── Jobs ──────────────────────────────────────────────────────────────────
  'job-row', // At least one Job row exists on the tenant — precondition for
  // GET /jobs/:jobId, PATCH /jobs/:jobId/dismiss, DELETE /jobs/:jobId.
  'failed-job', // At least one Job with status='failed' exists on the tenant —
  // precondition for POST /jobs/:jobId/retry.
  // ── AI ────────────────────────────────────────────────────────────────────
  'ai-gateway-credits', // The configured AI provider has a positive credit
  // balance. Tests that invoke LLM-backed endpoints fail when credits are
  // exhausted; leave off in CI to exclude live-LLM tests.
  'hitl-suspended-agent', // A live suspended agent run (HITL confirm-action)
  // exists on a conversation — precondition for the resume happy path.
  'hitl-token', // A live MCP HITL challenge token exists on the tenant —
  // precondition for the POST /mcp/hitl/:token/step-up happy path. Supply
  // the token via `TESTS_HITL_TOKEN=…`.
  'voice-agent-secret', // `VOICE_AGENT_SECRET` env var is set on the backend —
  // precondition for `POST /voice/internal/respond` happy path.
  // ── Desk (Inngest workflow engine — responsibility registry ships empty) ──
  'desk-approval', // At least one PENDING DeskApproval row exists on the
  // tenant — precondition for the approval claim/decide tests.
  'desk-episode', // At least one DeskEpisode row exists on the tenant —
  // precondition for the episode-detail test.
  'desk-responsibility', // At least one DeskResponsibility row exists —
  // precondition for the responsibility detail/PATCH tests.
  'desk-agent-key', // At least one DeskAgent row exists on the tenant —
  // precondition for PATCH /desk/agents/:key.
  'desk-memory', // At least one DeskMemory row exists on the tenant —
  // precondition for the memory list/patch/delete tests.
  'inngest-configured', // `INNGEST_EVENT_KEY` AND `INNGEST_SIGNING_KEY` env
  // vars are set on the backend — precondition for manual responsibility
  // runs and the Inngest serve handler.
] as const;

export type DataCapability = (typeof KNOWN_DATA_CAPABILITIES)[number];

/**
 * Parses TESTS_DATA_CAPABILITIES into { present, missing } sets.
 *
 * When the env var is unset, ALL known data capabilities are treated as
 * missing (conservative — tests tagged with any `@requires:data-*` are
 * excluded until the tenant is explicitly declared to have the data).
 *
 * Bypassed entirely when ENABLE_ALL_TESTS=1.
 */
export function detectDataCapabilities(): {
  present: Set<string>;
  missing: Set<string>;
} {
  const known = new Set<string>(KNOWN_DATA_CAPABILITIES);

  if (process.env.ENABLE_ALL_TESTS === '1') {
    return { present: known, missing: new Set<string>() };
  }

  const raw = process.env.TESTS_DATA_CAPABILITIES ?? '';
  const present = new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const missing = new Set<string>();
  for (const cap of known) {
    if (!present.has(cap)) missing.add(cap);
  }
  return { present, missing };
}

// ── grepInvert builder ────────────────────────────────────────────────────────

/**
 * Builds a Playwright grepInvert regex that excludes tests tagged with any
 * of:
 *   - `@requires:plan-<feature>` for a disabled plan feature
 *   - `@requires:data-<kind>` for an absent data capability
 *
 * Returns undefined when nothing should be excluded (all tests run).
 *
 * Tag conventions:
 *   - @requires:plan-<snake_case_feature>  (e.g. plan-ai_assistant)
 *   - @requires:data-<kebab-case-kind>     (e.g. data-customer-linked)
 */
export function buildGrepInvert(
  disabledPlan: Set<string>,
  missingData: Set<string> = new Set<string>(),
): RegExp | undefined {
  if (disabledPlan.size === 0 && missingData.size === 0) return undefined;

  // Escape regex metacharacters defensively.
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const parts: string[] = [];
  if (disabledPlan.size > 0) {
    parts.push(`plan-(?:${[...disabledPlan].map(escape).join('|')})`);
  }
  if (missingData.size > 0) {
    parts.push(`data-(?:${[...missingData].map(escape).join('|')})`);
  }

  return new RegExp(`@requires:(?:${parts.join('|')})\\b`);
}

// ── JSON persistence ──────────────────────────────────────────────────────────

/**
 * Serialises a capability result into the JSON shape written to
 * tenant-capabilities.json. Keeps the file human-readable and auditable.
 */
export function buildCapabilitiesJson(tenantId: string, planKey: string, result: CapabilityResult): TenantCapabilities {
  return {
    tenantId,
    planKey,
    enabledFeatures: [...result.enabled].sort(),
    disabledFeatures: [...result.disabled].sort(),
    generatedAt: new Date().toISOString(),
  };
}

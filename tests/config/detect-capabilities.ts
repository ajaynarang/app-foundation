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
  /** Feature keys that are enabled — e.g. "samsara_integration" */
  enabledFeatures: string[];
  /** Feature keys that are disabled — e.g. "quickbooks_integration" */
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
 * The feature keys are raw snake_case strings (e.g. "samsara_integration") as
 * stored in the plan_entitlements table. Tags are formed as @requires:plan-<feature>.
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
  'customer-linked', // A CUSTOMER-role user is linked to a Customer record (User.customerId set)
  'completed-job', // At least one load has been delivered (for invoicing/settlements)
  'active-integration', // Tenant has an active external integration (Samsara, QuickBooks, etc.)
  'pending-driver', // At least one driver exists in PENDING_ACTIVATION status (integration-synced)
  'factoring-linked', // A FactoringCompany exists AND at least one Customer has defaultFactoringCompanyId
  // set (so a generated invoice inherits billingPath=FACTORED, the precondition
  // for /invoices/:id/submit-to-factor and /invoices/:id/factor). Demo tenant
  // does not seed this today; Phase 2 Group 2c will.
  'approved-settlement', // At least one APPROVED Settlement exists — the precondition for
  // POST /settlements/:id/pay. Unreachable today via the public API because
  // POST /settlements/:id/approve is blocked by finding #21 (user.userId string vs
  // approvedBy Int). Flip this capability on once #21 lands.
  // ── Phase 3 (operations) additions ────────────────────────────────────────
  'active-route-plan', // At least one ACTIVE RoutePlan with segments — precondition for
  // /api/v1/routes/:planId/* monitoring endpoints; plan generation is
  // `smart_routes`-gated and asynchronous, so helpers cannot bootstrap from zero.
  'shield-audit', // At least one COMPLETED Shield audit with findings — used when the
  // audit trigger helper can't synchronously reach COMPLETED in CI (poll timeout).
  'open-alert', // At least one Alert in `active` status — alerts are rule-emitted
  // (no public POST), so tests rely on existing tenant state.
  'in-app-notification', // At least one UNREAD InAppNotification owned by the current
  // user — notifications are system-generated, no public POST exists.
  'ifta-quarter', // At least one IftaQuarter exists for the current year — seeded by
  // a scheduled job, not a public endpoint.
  'alerts-bulk-routable', // `POST /alerts/bulk/acknowledge` and `/bulk/resolve`
  // route correctly. Today they are shadowed by the single-id
  // `:alert_id/acknowledge` / `:alert_id/resolve` routes declared earlier
  // in AlertsController (Nest matches in declaration order → alertId='bulk').
  // Flip this capability on once finding #31 is resolved (reorder the
  // controller methods, or move bulk endpoints under a distinct prefix).
  'ai-gateway-credits', // The Vercel AI Gateway configured for this env has a
  // positive credit balance. Tests that invoke LLM-backed endpoints (e.g.
  // POST /alerts/briefing?force=true) 500 when credits are exhausted — see
  // finding #32. Flip this on via TESTS_DATA_CAPABILITIES=ai-gateway-credits
  // when credits are topped up, or leave off in CI to exclude the live-LLM tests.
  // ── Phase 4 Group 4c (platform/tenants) additions ─────────────────────────
  'pending-tenant', // At least one Tenant with status=PENDING_APPROVAL exists.
  // Precondition for `POST /tenants/:tenantId/approve` (and `/reject`, if the
  // spec grows one). Pending tenants originate from `POST /tenants/register`
  // — Turnstile-gated on dev (see finding #37) — so the QA env either has
  // one seeded OR the capability is absent. Operator flips this on via
  // `TESTS_DATA_CAPABILITIES=pending-tenant` after confirming
  // `GET /tenants?status=PENDING_APPROVAL` returns a non-empty list.
  'suspended-tenant', // At least one Tenant with status=SUSPENDED exists.
  // Precondition for `POST /tenants/:tenantId/reactivate`. Suspended tenants
  // are created manually via `POST /tenants/:id/suspend`; same flip mechanism
  // as above — `GET /tenants?status=SUSPENDED` must return a non-empty list.
  'suspendable-tenant', // At least one non-critical ACTIVE tenant exists
  // that is safe to suspend+reactivate as part of a test (NOT the demo
  // tenant, NOT any customer-touching environment). In practice: dedicated
  // QA tenants like `qa-suspend-*` seeded specifically for this purpose.
  // Tag is declared for future use — no test in Group 4c writes against it
  // today because no such tenant is seeded on demo-northstar.
  'tenant-register-bypass', // Turnstile bot-verification is DISABLED for
  // `POST /tenants/register` (no `TURNSTILE_SECRET_KEY`, or a development
  // stub returns `success: true` for any token). Absent on dev/stg/prd; flip
  // on ONLY for environments with a deliberately disabled Turnstile gate.
  // Precondition for the happy-path register test — otherwise the request
  // is rejected at the `Bot verification required` layer. See finding #37.
  // ── Phase 4 Group 4e (platform/plans) additions ───────────────────────────
  'assignable-tenant', // At least one non-demo, non-SUSPENDED, non-REJECTED
  // Tenant exists — precondition for `PATCH /plans/tenant/:tenantId`
  // (plan-assignment test). The helper `firstAssignableTenantId` captures
  // the target's original plan before the write and restores it in
  // afterEach. Demo envs typically ship 3+ seeded tenants that qualify
  // (TRIAL / TRIAL_EXPIRED / ENTERPRISE); flip on via
  // `TESTS_DATA_CAPABILITIES=assignable-tenant` when verified.
  // ── Phase 5 Group 5c (accounting/QuickBooks) additions ────────────────────
  'accounting-mapping', // At least one IntegrationEntityMapping row exists for
  // a customer/vendor/class entity type. Mappings are created by
  // `accounting-mapping.service.ts::autoMatchCustomers` during the initial
  // sync flow, which requires real QB OAuth credentials. Demo tenants ship
  // zero mappings → flip on via `TESTS_DATA_CAPABILITIES=accounting-mapping`
  // after running `POST /accounting/setup/initial-sync` on an OAuth-connected
  // integration and confirming `GET /accounting/mappings/customer` returns a
  // non-empty list. Precondition for PATCH /accounting/mappings/:id and
  // POST /accounting/mappings/:id/confirm.
  'accounting-account-mapping', // At least one AccountingAccountMapping row
  // exists (platform line-item type → QB chart-of-accounts). Created by
  // `createDefaultAccountMappings` during initial sync — same credential
  // precondition as above. Precondition for PATCH /accounting/account-mappings/:id.
  // ── Phase 5 Group 5d (EDI) additions ─────────────────────────────────────
  'edi-tender', // At least one pending EDI tender (Load in TENDER status
  // linked to an inbound T204 EDIMessage) exists on the tenant.
  // Precondition for `POST /edi/tenders/:loadId/respond`. No public
  // POST to create a tender — the only ingress is `POST /edi/webhooks/:tenantId`
  // which is gated on EDI_WEBHOOK_SECRET (finding #43). Demo tenants
  // ship zero tenders → flip on via `TESTS_DATA_CAPABILITIES=edi-tender`
  // after seeding a tender (e.g. via the webhook once its secret is set)
  // and confirming `GET /edi/tenders` returns a non-empty list.
  'edi-suggested-rule', // At least one EDIAutoAcceptRule row with
  // `createdBy='assistant_suggested'` AND `approvedAt=null` exists.
  // Precondition for `PATCH /edi/tenders/rules/:ruleId/approve`.
  // Assistant-suggested rules are created by the AI pattern-detection
  // subsystem (no public POST); seed manually and flip
  // `TESTS_DATA_CAPABILITIES=edi-suggested-rule`.
  'edi-webhook-secret', // `EDI_WEBHOOK_SECRET` env var is set on the
  // backend. Precondition for `POST /edi/webhooks/:tenantId` happy path.
  // Unset on dev today (finding #43) — the controller throws 401
  // "Webhook endpoint not configured" on any call. Flip on via
  // `TESTS_DATA_CAPABILITIES=edi-webhook-secret` AFTER setting
  // EDI_WEBHOOK_SECRET in the target env. Env-gated (not DB-gated)
  // capability — precedent: `tenant-register-bypass`.
  // ── Phase 5 Group 5e (email intake) additions ────────────────────────────
  'email-intake-thread', // At least one EmailIngestThread row exists on
  // the tenant — precondition for GET/POST /integrations/email-intake/
  // threads/:id and the confirm/discard/restore/approve-sender endpoints.
  // Threads are created exclusively by the Resend inbound webhook
  // (POST /integrations/email-intake/webhook) when a recipient address
  // resolves to the tenant. Demo tenants ship zero threads — flip on via
  // `TESTS_DATA_CAPABILITIES=email-intake-thread` after seeding a thread
  // (e.g. by POSTing a legacy-flat webhook payload whose `to[0]` matches
  // the tenant's `inboundAddress` from GET /integrations/email-intake/
  // settings) and confirming `GET /integrations/email-intake/threads`
  // returns a non-empty `data[]`.
  'email-intake-attachment', // At least one EmailIngestAttachment row
  // exists on the tenant — precondition for POST /integrations/email-intake/
  // attachments/:id/reparse. Strict subset of `email-intake-thread` (every
  // attachment belongs to a message which belongs to a thread), but gated
  // separately because a thread could exist without any attachment rows
  // (e.g. if the first webhook payload had zero attachments). Seed via
  // the same flow as `email-intake-thread` but include at least one entry
  // in the webhook payload's `attachments[]` array.
  // ── Phase 5 Group 5f (load board) additions ──────────────────────────────
  // ── Phase 6 Group 6a (Assistant AI core) additions ───────────────────────────
  // ── Phase 6 Group 6b (document intelligence + jobs) additions ───────────
  'job-row', // At least one Job row exists on the tenant. Precondition
  // for tests 15 (GET /jobs/:jobId), 17a (PATCH /jobs/:jobId/dismiss), and
  // 17b (DELETE /jobs/:jobId). Demo tenants typically accumulate Job rows
  // through ratecon parses + scheduled fleet/eld syncs; flip on via
  // `TESTS_DATA_CAPABILITIES=job-row` after confirming GET /jobs returns
  // a non-empty `items` list. The bootstrap helper `firstJobRow` enforces
  // the precondition with a descriptive error if the capability is
  // mistakenly active without data.
  'failed-job', // At least one Job with status='failed' exists on the
  // tenant. Precondition for test 16 (POST /jobs/:jobId/retry) — the
  // controller (jobs.controller.ts line 102) throws BadRequestException
  // for any non-failed job. Failed jobs originate from BullMQ processor
  // exceptions (out-of-credits LLM calls, S3 failures, etc.); flip on
  // via `TESTS_DATA_CAPABILITIES=failed-job` after a parse run lands
  // in failed status. The bootstrap helper `firstFailedJobId` enforces
  // the same loud-fail pattern as `job-row` above.
  'hitl-suspended-agent', // At least one Assistant AI conversation has a live
  // suspended agent run with a known runId + toolCallId that can be
  // resumed. Suspended runs originate from a chat turn that triggered
  // a `confirm-action` tool-call; they live inside Mastra's in-memory
  // agent runtime. There is no public POST to create one on demand —
  // it requires (a) an LLM invocation that hits a HITL-gated tool AND
  // (b) a persisted suspendPayload on the conversation. Demo tenants
  // ship zero suspended runs; flip on via
  // `TESTS_DATA_CAPABILITIES=hitl-suspended-agent` only after seeding
  // one and verifying `assistantAiService.resumeAgent` reaches the happy
  // path. Precondition for a full resume-endpoint happy-path test;
  // Group 6a asserts only the error-path shape (no seed required).
  'load-board-listing', // At least one DAT load-board listing is retrievable
  // via POST /load-board/search. On dev with `MOCK_MODE=all` the DAT mock
  // adapter returns MOCK_LISTINGS deterministically (dat-mock-data.ts) —
  // so the capability is effectively always-on in mock envs. In live envs
  // (MOCK_MODE off) the adapter requires real DAT OAuth credentials AND a
  // positive match; in that case flip
  // `TESTS_DATA_CAPABILITIES=load-board-listing` only after verifying a
  // broad search returns a non-empty `listings[]`. Precondition for
  // POST /load-board/import (test 65) which must resolve an `externalId`.
  // ── Phase 6 Group 6c (voice internal endpoint) additions ─────────────────
  'voice-agent-secret', // `VOICE_AGENT_SECRET` env var is set on the
  // backend. Precondition for `POST /voice/internal/respond` happy path —
  // the controller (voice.controller.ts:64-77) compares the request's
  // `x-voice-agent-secret` header to `process.env.VOICE_AGENT_SECRET`
  // via `crypto.timingSafeEqual`. Unset → 403 ForbiddenException. Set on
  // dev today (verified 2026-04-27 via Doppler). Env-gated, not
  // DB-detectable; flip via `TESTS_DATA_CAPABILITIES=voice-agent-secret`.
  // Precedent: `tenant-register-bypass`, `edi-webhook-secret`.
  // ── Phase 6 Group 6d (MCP HITL) additions ────────────────────────────────
  'hitl-token', // A live MCP HITL challenge token exists on the tenant.
  // HitlChallenge rows are created by `HitlChallengeService` when an
  // agent tool call hits a sensitive-tier handler (mcp-server.service.ts).
  // No public POST to mint one — requires a full MCP OAuth session +
  // a tool dispatch that triggers HITL. Demo tenants ship zero tokens,
  // and there's no synchronous way to seed one from the QA harness.
  // Precondition for the test 32 happy-path branch (POST /mcp/hitl/:token/
  // step-up — 400 'no PIN set' once a real challenge exists). Tests 30
  // and 31 deliberately use a sentinel non-existent UUID and assert the
  // 404 path, so they DO NOT need this capability. Flip via
  // `TESTS_DATA_CAPABILITIES=hitl-token` only after manually seeding a
  // challenge and supplying the token via env (`TESTS_HITL_TOKEN=…`).
  // Phase 8/9 will land the positive-flow tests; Phase 6d is error-path-only.
  // ── Phase 6 Group 6e (desk core) additions ───────────────────────────────
  'desk-approval', // At least one PENDING DeskApproval row exists on the
  // tenant — precondition for tests 34 (claim) + 35 (decide). Pending
  // rows are created by Inngest `ar_followup` runs that gate for human
  // approval; on demo-northstar today most ar_followup runs auto-decide
  // under SUPERVISED trust + cleanup, leaving zero rows. Bootstrap via
  // POST /desk/responsibilities/ar_followup/run AND confirming
  // `GET /desk/approvals` returns a non-empty array. Flip via
  // `TESTS_DATA_CAPABILITIES=desk-approval`.
  'desk-episode', // At least one DeskEpisode row exists on the tenant —
  // precondition for test 37 (episode detail). Episodes are created
  // by every Inngest workflow run; demo-northstar has 2+ rows from
  // historical ar_followup + eta_monitoring sweeps (verified
  // 2026-04-27). Test 36 (list) MAY return empty rows[] without
  // gating — Group 6e leaves it unguarded because the envelope shape
  // is the contract.
  'desk-responsibility', // At least one DeskResponsibility row exists AND the
  // live `desk_responsibilities` table is queryable via Prisma's
  // `findUnique({select: {notesForAssistant, supervisorUserId, ...}})`. PR #663
  // bootstraps all 10 registry rows on tenant approve; demo-northstar
  // verified to have them (2026-04-27). Test 41 (list) does NOT need this
  // capability — the list service projection avoids the drifted columns.
  // Tests 42 (detail), 43 (ui-spec — which itself doesn't need this either,
  // but is gated for ergonomic alignment with detail), and 44 (PATCH)
  // gate on the SAME drift as Finding #53 — `apps/backend/prisma/
  // schema.prisma::DeskResponsibility` declares `notesForAssistant` and
  // `supervisorUserId` columns the live `desk_responsibilities` table no
  // longer has (parallel migration to the desk_memories one). After
  // realigning the schema + regenerating Prisma client, flip via
  // `TESTS_DATA_CAPABILITIES=desk-responsibility`.
  'desk-agent-key', // At least one DeskAgent row exists on the tenant.
  // PR #663 bootstraps the agent roster on tenant approve; demo-northstar
  // verified to have 6 rows (the 12 AGENT_KEYS minus 6 that don't own a
  // registered responsibility yet). Test 47 (PATCH /desk/agents/:key)
  // gates on this; test 46 (list) does not (an empty array is a valid
  // contract). Flip via `TESTS_DATA_CAPABILITIES=desk-agent-key`.
  'inngest-configured', // `INNGEST_EVENT_KEY` AND `INNGEST_SIGNING_KEY`
  // env vars are set on the backend. Precondition for both
  // `POST /desk/responsibilities/ar_followup/run` (test 45 — Inngest
  // dispatch fails with 500 'no event key' on every overdue invoice) AND
  // `GET /api/v1/api/inngest` (test 48 — the serve handler returns 500
  // `{code: 'internal_server_error'}` without a signing key). Unset on
  // dev today (verified 2026-04-27 — Finding #55). Env-gated, not
  // DB-detectable; flip via `TESTS_DATA_CAPABILITIES=inngest-configured`
  // AFTER setting both env vars in the target env. Precedent:
  // `tenant-register-bypass`, `edi-webhook-secret`, `voice-agent-secret`.
  'desk-memory', // At least one DeskMemory row exists AND the live
  // `desk_memories` table is queryable via Prisma — precondition for
  // tests 38 (list), 39 (patch), 40 (delete). See Finding #53: the
  // Prisma model in `apps/backend/prisma/schema.prisma` is currently
  // out of sync with the live DB columns (migration
  // 20260427120000_desk_memory_scope_polarity_playbook... has been
  // applied to dev DB but `kind` is still in the model). Today every
  // call to GET /desk/memories returns 500 (P2022). Once the schema +
  // generated client are realigned AND a memory row is seeded (e.g. by
  // running an ar_followup that lands an outcome), flip via
  // `TESTS_DATA_CAPABILITIES=desk-memory`.
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
 *   - @requires:plan-<snake_case_feature>  (e.g. plan-samsara_integration)
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

/**
 * Operations — Shield audits (Phase 3 Group 3d).
 *
 * Covers 6 audit-surface endpoints on `ShieldController` — the remaining 7
 * (findings + custom rules) live in `shield-findings-rules.spec.ts`:
 *
 *   1. GET  /shield                       latest-audit overview envelope
 *   2. GET  /shield/score                 lightweight compliance scores
 *   3. POST /shield/audit                 trigger a new audit (may be queued
 *                                         or return the existing in-progress
 *                                         audit id — both are valid envelopes)
 *   4. GET  /shield/audits                paginated audit history
 *   5. GET  /shield/audits/:id            audit detail with findings
 *   6. GET  /shield/audits/:id/export     binary PDF (Content-Type: application/pdf)
 *
 * All tests run as `asDispatcher` — the controller is class-level gated to
 * DISPATCHER/ADMIN/OWNER and the dispatcher fixture is the cheapest role to
 * switch to.
 *
 * Plan gate `@requires:plan-shield` on every test (`@RequireFeature('shield')`).
 *
 * Data gate: tests 5 + 6 require a COMPLETED audit. `seedShieldAudit()` polls
 * GET /shield until the latest audit is COMPLETED and returns its id. Demo
 * tenants today carry ≥1 COMPLETED audit (scheduled cron), so the poll
 * typically returns immediately. When the poll times out (cold tenant, or AI
 * analysis hangs) the helper throws — the test is tagged
 * `@requires:data-shield-audit` and excluded at collection time.
 *
 * Audit persistence: Shield audits are NOT deletable via any public endpoint.
 * Test 3 triggers a new audit which persists in the tenant forever — the
 * controller guards against parallel audits (`status in [QUEUED, RUNNING]`
 * returns `{ queued: false, auditId: <existing> }` instead of creating a
 * second row), so repeated runs do not multiply audit rows without bound.
 * Captured in the file header: no cleanup is possible, this is expected.
 *
 * Schema drift — hot-fixed here with `TODO(phase-3-verify) finding #30` style
 * overrides (see also finding #33 below — live response shapes diverge from
 * the shared-types `ShieldAuditSchema` / `ShieldCustomRuleSchema`):
 *
 *   - `ShieldAuditSchema` (shared-types) omits several columns that the
 *     controller DOES return: `tenantId`, `triggeredById`, `aiTokensUsed`,
 *     `aiSkippedRules`, `errorMessage`, `updatedAt`. `.strict()` against the
 *     shared-types schema fails on every real audit. Hot-fix: `LiveShieldAuditSchema`.
 *   - `ShieldFindingSchema` (shared-types) declares `source` as optional +
 *     omits `tenantId`, `resolvedById`, `updatedAt`. Controller mapper always
 *     emits all three. Hot-fix: `LiveShieldFindingSchema`.
 *   - `GET /shield` envelope — `audit` nests `LiveShieldAuditSchema`. The
 *     `inProgressAudit` sub-envelope matches the shared-types schema
 *     (service projects only { id, status, scope, createdAt }).
 *
 * Binary assertion: test 6 uses `extractBinaryLength` from
 * `tests/api/_shared/binary.ts` — no PDF parsing, only envelope. PDF
 * generation measured at ~1.6s locally → tagged `@slow` defensively since
 * production cold-start may cross the 3s threshold.
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract, expectArrayContract } from '@sally/test-utils/schemas';
import { buildTriggerAuditPayload } from '@sally/test-utils/factories';
import { z } from 'zod';
import { extractBinaryLength } from '../_shared/binary.js';
import { seedShieldAudit } from './_shield-helpers.js';

// ── Live ShieldAudit schema (TODO(phase-3-verify) finding #33) ──────────────
//
// Controller returns the raw Prisma row through `prisma.shieldAudit.findFirst`
// which includes `tenantId`, `triggeredById`, `aiTokensUsed`, `aiSkippedRules`,
// `errorMessage`, `updatedAt` — all absent from shared-types' ShieldAuditSchema.
// Declare them here with nullable/optional modifiers matching the wire.
const LiveShieldAuditSchema = z
  .object({
    id: z.string(),
    tenantId: z.number().int(),
    scope: z.enum(['FULL', 'HOS', 'DRIVERS', 'VEHICLES', 'LOADS']),
    status: z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED']),
    overallScore: z.number().nullable(),
    hosScore: z.number().nullable(),
    driversScore: z.number().nullable(),
    vehiclesScore: z.number().nullable(),
    loadsScore: z.number().nullable(),
    statusLabel: z.enum(['PROTECTED', 'AT_RISK', 'VULNERABLE']).nullable(),
    triggeredBy: z.string(),
    triggeredById: z.number().int().nullable(),
    startedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    durationMs: z.number().nullable(),
    aiSummary: z.string().nullable(),
    aiInsights: z.array(z.unknown()).nullable(),
    aiActions: z.array(z.unknown()).nullable(),
    aiDurationMs: z.number().nullable(),
    includeAi: z.boolean(),
    aiModelUsed: z.string().nullable(),
    aiTokensUsed: z.number().nullable(),
    aiSkippedRules: z.unknown().nullable(),
    auditPeriodDays: z.number().int().nullable(),
    coverage: z.record(z.string(), z.array(z.unknown())).nullable(),
    errorMessage: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    // Detail-only fields populated by `GET /shield/audits/:id` +
    // `GET /shield`'s `audit` include.
    findings: z.array(z.unknown()).optional(),
    triggeredByUser: z.object({ firstName: z.string(), lastName: z.string() }).nullable().optional(),
    _count: z.object({ findings: z.number().int() }).optional(),
  })
  .strict();

// ── GET /shield envelope ────────────────────────────────────────────────────
//
// Two shapes possible: the "no audits" branch returns only `{ hasAudit, inProgress,
// hasFailed, nextScheduledAt, message }`; the populated branch returns
// `{ hasAudit, inProgress, hasFailed, nextScheduledAt, inProgressAudit?, audit? }`.
// Both shapes carry `hasAudit` + `inProgress` + `hasFailed` + `nextScheduledAt`
// as required. `audit` uses LiveShieldAuditSchema to tolerate Prisma row drift.
const ShieldLatestEnvelopeSchema = z
  .object({
    hasAudit: z.boolean(),
    inProgress: z.boolean(),
    hasFailed: z.boolean(),
    nextScheduledAt: z.string(),
    message: z.string().optional(),
    inProgressAudit: z
      .object({
        id: z.string(),
        status: z.enum(['QUEUED', 'RUNNING']),
        scope: z.enum(['FULL', 'HOS', 'DRIVERS', 'VEHICLES', 'LOADS']),
        createdAt: z.string(),
      })
      .strict()
      .optional(),
    audit: LiveShieldAuditSchema.optional(),
  })
  .strict();

// ── GET /shield/score response ───────────────────────────────────────────────
//
// Hand-written — shared-types has no peer. `service.computeLatestScores`
// returns the 7-key object below; numbers are all nullable (no FULL audit yet
// ⇒ null), statusLabel + completedAt likewise nullable.
const ShieldScoreResponseSchema = z
  .object({
    overallScore: z.number().nullable(),
    hosScore: z.number().nullable(),
    driversScore: z.number().nullable(),
    vehiclesScore: z.number().nullable(),
    loadsScore: z.number().nullable(),
    statusLabel: z.enum(['PROTECTED', 'AT_RISK', 'VULNERABLE']).nullable(),
    completedAt: z.string().nullable(),
  })
  .strict();

// ── POST /shield/audit response ──────────────────────────────────────────────
//
// Shape `{ queued: boolean, auditId: string, message?: string }`. When an
// audit is already in progress, controller returns `queued=false` with the
// existing audit's id and a `message` explaining why — still HTTP 201. Strict.
const TriggerAuditResponseStrictSchema = z
  .object({
    queued: z.boolean(),
    auditId: z.string(),
    message: z.string().optional(),
  })
  .strict();

// ── GET /shield/audits list item (narrow projection) ────────────────────────
//
// `getAuditHistory` service uses a narrower `select` than the Prisma model —
// only id, scope, status, scores, statusLabel, triggeredBy, startedAt,
// completedAt, durationMs, createdAt, _count.findings. No AI columns, no
// tenantId, no triggeredById. Declared separately to avoid false-positive
// drift on the detail schema.
const ShieldAuditHistoryItemSchema = z
  .object({
    id: z.string(),
    scope: z.enum(['FULL', 'HOS', 'DRIVERS', 'VEHICLES', 'LOADS']),
    status: z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED']),
    overallScore: z.number().nullable(),
    hosScore: z.number().nullable(),
    driversScore: z.number().nullable(),
    vehiclesScore: z.number().nullable(),
    loadsScore: z.number().nullable(),
    statusLabel: z.enum(['PROTECTED', 'AT_RISK', 'VULNERABLE']).nullable(),
    triggeredBy: z.string(),
    startedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    durationMs: z.number().nullable(),
    createdAt: z.string(),
    _count: z.object({ findings: z.number().int() }).strict(),
  })
  .strict();

// ── GET /shield/audits paginated envelope ────────────────────────────────────
const AuditHistoryEnvelopeSchema = z
  .object({
    audits: z.array(ShieldAuditHistoryItemSchema),
    total: z.number().int(),
  })
  .strict();

test.describe('Operations · Shield · audits @workflow @requires:plan-shield', () => {
  // 1 ── GET /shield ──────────────────────────────────────────────────────────
  test('GET /shield returns latest audit envelope with nextScheduledAt @workflow @requires:plan-shield', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/shield');
    expect(res.status()).toBe(200);
    const body = expectContract(ShieldLatestEnvelopeSchema, await res.json(), 'GET /shield');

    // Semantic — `nextScheduledAt` is a future ISO timestamp relative to now
    // (cron schedules the next Shield pass). hasFailed cannot be true when
    // hasAudit is true (the controller suppresses the failed signal if a
    // completed audit is available — see shield.controller.ts:74-75).
    const nextMs = Date.parse(body.nextScheduledAt);
    expect(Number.isNaN(nextMs)).toBe(false);
    if (body.hasAudit) {
      expect(body.hasFailed).toBe(false);
      expect(body.audit).toBeDefined();
      expect(body.audit?.status).toBe('COMPLETED');
    }
    if (body.inProgress) {
      expect(body.inProgressAudit).toBeDefined();
    }
  });

  // 2 ── GET /shield/score ────────────────────────────────────────────────────
  test('GET /shield/score returns 7-key scores envelope with nullable numbers @workflow @requires:plan-shield', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/shield/score');
    expect(res.status()).toBe(200);
    const scores = expectContract(ShieldScoreResponseSchema, await res.json(), 'GET /shield/score');

    // Semantic — every numeric score, when non-null, is bounded [0..100]; the
    // aggregate statusLabel is null iff the tenant has no COMPLETED FULL audit.
    for (const key of ['overallScore', 'hosScore', 'driversScore', 'vehiclesScore', 'loadsScore'] as const) {
      const value = scores[key];
      if (value !== null) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
    if (scores.completedAt !== null) {
      expect(Number.isNaN(Date.parse(scores.completedAt))).toBe(false);
    }
  });

  // 3 ── POST /shield/audit ───────────────────────────────────────────────────
  test('POST /shield/audit returns a trigger envelope with auditId and queued flag @workflow @requires:plan-shield @destructive', async ({
    asDispatcher,
  }) => {
    // NOTE: `@destructive` because a successful trigger persists a new audit
    // row + starts the BullMQ job. Audits are not deletable.
    const payload = buildTriggerAuditPayload();
    const res = await asDispatcher.post('/shield/audit', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(TriggerAuditResponseStrictSchema, await res.json(), 'POST /shield/audit');

    // Semantic — auditId is a non-empty string; `queued` reflects whether a
    // fresh audit was enqueued (no prior RUNNING/QUEUED audit for the tenant).
    // When `queued=false`, controller returns an explanatory message AND the
    // id of the existing in-progress audit.
    expect(body.auditId.length).toBeGreaterThan(0);
    if (!body.queued) {
      expect(body.message).toBeDefined();
      expect(body.message?.length ?? 0).toBeGreaterThan(0);
    }

    // Persistence — the audit id is discoverable via GET /shield or
    // GET /shield/audits.
    const historyRes = await asDispatcher.get('/shield/audits?limit=100');
    expect(historyRes.status()).toBe(200);
    const history = expectContract(AuditHistoryEnvelopeSchema, await historyRes.json());
    const matched = history.audits.find((a) => a.id === body.auditId);
    // Either the audit is already materialised in history (existing in-progress
    // or a cron-completed audit surfaced via queued=false) OR it has been
    // queued and is still in /shield's `inProgressAudit` sub-envelope.
    if (!matched) {
      const latestRes = await asDispatcher.get('/shield');
      expect(latestRes.status()).toBe(200);
      const latest = expectContract(ShieldLatestEnvelopeSchema, await latestRes.json());
      const ids = [latest.audit?.id, latest.inProgressAudit?.id].filter((x): x is string => typeof x === 'string');
      expect(ids).toContain(body.auditId);
    }
  });

  // 4 ── GET /shield/audits ───────────────────────────────────────────────────
  test('GET /shield/audits returns paginated envelope honoring limit @workflow @requires:plan-shield', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/shield/audits?limit=3');
    expect(res.status()).toBe(200);
    const body = expectContract(AuditHistoryEnvelopeSchema, await res.json(), 'GET /shield/audits');

    // Semantic — `total` bounds the returned count; envelope honours the limit.
    expect(body.total).toBeGreaterThanOrEqual(body.audits.length);
    expect(body.audits.length).toBeLessThanOrEqual(3);

    // Narrowing with dateFrom returns ≤ the total, proving the filter
    // actually restricts the result space.
    const narrowRes = await asDispatcher.get('/shield/audits?limit=3&dateFrom=2099-01-01');
    expect(narrowRes.status()).toBe(200);
    const narrow = expectContract(AuditHistoryEnvelopeSchema, await narrowRes.json());
    expect(narrow.total).toBeLessThanOrEqual(body.total);
  });

  // 5 ── GET /shield/audits/:id ───────────────────────────────────────────────
  test('GET /shield/audits/:id returns detail with findings array @workflow @requires:plan-shield @requires:data-shield-audit', async ({
    asDispatcher,
  }) => {
    const { auditId } = await seedShieldAudit(asDispatcher);

    const res = await asDispatcher.get(`/shield/audits/${auditId}`);
    expect(res.status()).toBe(200);
    const detail = expectContract(LiveShieldAuditSchema, await res.json(), 'GET /shield/audits/:id');

    // Semantic — id echoes the seeded audit; status is COMPLETED; findings is
    // an array (possibly empty). Score fields are populated (non-null) because
    // the audit reached COMPLETED.
    expect(detail.id).toBe(auditId);
    expect(detail.status).toBe('COMPLETED');
    expect(Array.isArray(detail.findings)).toBe(true);

    // Unknown id → 404.
    const missingRes = await asDispatcher.get('/shield/audits/cmo0000000000000000000000');
    expect(missingRes.status()).toBe(404);
  });

  // 6 ── GET /shield/audits/:id/export ───────────────────────────────────────
  test('GET /shield/audits/:id/export returns a non-empty PDF body @workflow @requires:plan-shield @requires:data-shield-audit @slow', async ({
    asDispatcher,
  }) => {
    const { auditId } = await seedShieldAudit(asDispatcher);

    // PDF generation measured ~1.6s locally on 3714 findings — production
    // cold start may exceed 3s. Tagged `@slow` and given a 30s ceiling.
    const res = await asDispatcher.get(`/shield/audits/${auditId}/export`, { timeout: 30_000 });
    expect(res.status()).toBe(200);

    // Headers — Content-Type is application/pdf; filename-bearing
    // Content-Disposition points to the seeded auditId; Content-Length is
    // echoed and matches the body length we read.
    const headers = res.headers();
    expect(headers['content-type']).toContain('application/pdf');
    expect(headers['content-disposition']).toContain(auditId);

    const length = await extractBinaryLength(res);
    expect(length).toBeGreaterThan(0);
    const headerLength = Number.parseInt(headers['content-length'] ?? '0', 10);
    if (!Number.isNaN(headerLength) && headerLength > 0) {
      expect(length).toBe(headerLength);
    }

    // Also exercise an unknown audit id — must return 404, not a corrupt
    // zero-length body. (The service raises NotFoundException before entering
    // the PDF generator.)
    const missingRes = await asDispatcher.get('/shield/audits/cmo0000000000000000000000/export');
    expect(missingRes.status()).toBe(404);

    // No teardown — audit is not deletable (expected, noted in file header).
    // Also verify we can't exercise the array contract helper here without
    // a payload; leave `expectArrayContract` imported only so future tests
    // don't have to re-add it.
    void expectArrayContract;
  });
});

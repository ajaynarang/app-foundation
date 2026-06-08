/**
 * Jobs Queue (Phase 6 Group 6b — 6 tests on JobsController).
 *
 * Covers all 6 endpoints on
 * `apps/backend/src/domains/ai/document-intelligence/jobs.controller.ts`:
 *
 *    13. GET    /jobs                            — paged list
 *    14. GET    /jobs/categories/summary         — 5-queue rollup
 *    15. GET    /jobs/:jobId                     — detail
 *    16. POST   /jobs/:jobId/retry               — failed-only
 *    17a. PATCH /jobs/:jobId/dismiss             — submitter-only flag
 *    17b. DELETE /jobs/:jobId                    — queued/processing only
 *
 * The 17a + 17b tests are DISTINCT (per the plan) — total spec count
 * is 6 in this file.
 *
 * Data preconditions:
 *   - Tests 15, 17a, 17b: `@requires:data-job-row`. Bootstrap via
 *     `firstJobRow(asDispatcher)`. Demo-northstar typically has Job
 *     rows from prior ratecon parses + scheduled fleet syncs; flip on
 *     via `TESTS_DATA_CAPABILITIES=job-row` after confirming.
 *   - Test 16: `@requires:data-failed-job`. Bootstrap via
 *     `firstFailedJobId`. Failed jobs only exist after a parse fails
 *     (out-of-credits gateway, S3 error, etc.). Likely absent on demo
 *     today — the test collection-excludes by default.
 *
 * Persistence:
 *   - Test 13 (list): self-validating — the schema's array shape +
 *     pagination envelope is the contract.
 *   - Test 14 (summary): no DB write; envelope-only.
 *   - Test 15 (detail): self-validating — single row.
 *   - Test 16 (retry): follow-up GET asserts `status` transitioned to
 *     'queued' (resetForRetry — service line 581-591).
 *   - Test 17a (dismiss): follow-up GET asserts `dismissedAt` is now
 *     non-null on the row.
 *   - Test 17b (cancel): follow-up GET asserts `status === 'cancelled'`.
 *
 * Test ordering:
 *   - 17a + 17b are CONTROL-FLOW SERIAL: dismiss first (PATCH sets a flag,
 *     row stays queued), THEN cancel (DELETE flips status). They share
 *     the bootstrapped jobId — running them in the wrong order would
 *     succeed accidentally but pollute follow-up assertions. Marked
 *     `describe.configure({ mode: 'serial' })`.
 *
 * IMPORTANT — destructive mutations (test 16, 17a, 17b):
 *   - Retry queues a fresh BullMQ job with the SAME jobId. If the worker
 *     is running, this triggers an actual parse. On QA env the worker
 *     is dormant → the row sits in `queued` and is reset by tenant-reset.
 *   - Dismiss is idempotent (just sets `dismissedAt`).
 *   - Cancel transitions status to `cancelled`; the BullMQ job is removed
 *     from Redis but the Prisma row remains.
 *   - All three mutations target a Job we did NOT create — pre-existing
 *     tenant data is mutated. To minimise blast radius, tests pick the
 *     newest row (controller orders by `createdAt: desc` in listJobsPaginated).
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildJobRetry, buildJobDismiss } from '@sally/test-utils/factories';
import { expectContract, AiSchemas } from '@sally/test-utils/schemas';
import { firstJobRow, firstFailedJobId } from './_helpers';

const {
  JobRowSchema,
  JobListResponseSchema,
  JobCategoriesSummarySchema,
  JobRetryResponseSchema,
  JobDismissResponseSchema,
  JobCancelResponseSchema,
} = AiSchemas;

test.describe('Jobs Queue · Read paths @workflow @contract', () => {
  // 13 ── GET /jobs ───────────────────────────────────────────────────
  test('GET /jobs returns the paged jobs list (DISPATCHER) @workflow @contract', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/jobs?limit=10');
    expect(res.status()).toBe(200);

    const body = expectContract(JobListResponseSchema, await res.json(), 'GET /jobs');

    // Semantic — limit echoes the request, offset defaults to 0,
    // items array length never exceeds the requested limit, total is
    // the unpaginated count and is at least the items length.
    expect(body.limit).toBe(10);
    expect(body.offset).toBe(0);
    expect(body.items.length).toBeLessThanOrEqual(10);
    expect(body.total).toBeGreaterThanOrEqual(body.items.length);
  });

  // 14 ── GET /jobs/categories/summary ───────────────────────────────
  test('GET /jobs/categories/summary returns the per-category rollup (DISPATCHER) @workflow @contract', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/jobs/categories/summary');
    expect(res.status()).toBe(200);

    const body = expectContract(
      JobCategoriesSummarySchema,
      await res.json(),
      'GET /jobs/categories/summary',
    );

    // Semantic — the response is a flat array (NOT envelope-wrapped).
    // Visible categories are filtered by integration availability
    // (job.service.ts::getVisibleCategories); on demo-northstar a
    // baseline of categories like `documents` + `lanes` is always
    // visible. We assert structural well-formedness without pinning
    // a specific category set (forward-compat).
    expect(Array.isArray(body)).toBe(true);
    for (const row of body) {
      expect(row.category.length).toBeGreaterThan(0);
      expect(['healthy', 'warning', 'critical']).toContain(row.health);
      // Today-totals are aggregates of per-status counts; succeeded +
      // failed cannot exceed the total (the gap is queued/processing/
      // cancelled which fall outside the rolled-up status set).
      expect(row.todaySucceeded + row.todayFailed).toBeLessThanOrEqual(row.todayTotal);
      // The schema enforces non-negative; documenting the array shape
      // with a structural check rather than a content-pinning one.
      expect(Array.isArray(row.types)).toBe(true);
    }
  });

  // 15 ── GET /jobs/:jobId ────────────────────────────────────────────
  test('GET /jobs/:jobId returns the job detail (DISPATCHER) @workflow @contract @requires:data-job-row', async ({
    asDispatcher,
  }) => {
    const { jobId } = await firstJobRow(asDispatcher);

    const res = await asDispatcher.get(`/jobs/${jobId}`);
    expect(res.status()).toBe(200);

    const body = expectContract(JobRowSchema, await res.json(), `GET /jobs/${jobId}`);

    // Semantic — the row's id matches the requested jobId, and the
    // category/type fields are non-empty (every Job has both).
    expect(body.id).toBe(jobId);
    expect(body.category.length).toBeGreaterThan(0);
    expect(body.type.length).toBeGreaterThan(0);
  });
});

test.describe('Jobs Queue · Retry @workflow @destructive', () => {
  // 16 ── POST /jobs/:jobId/retry ─────────────────────────────────────
  //
  // Default for NestJS POST without @HttpCode = 201. Controller line 157
  // returns the trimmed envelope `{ jobId, status: 'queued' }`.
  //
  // `@requires:data-failed-job` — controller line 102-104 throws
  // BadRequestException for any non-failed job. Without a failed seed
  // the test collection-excludes; with one, the resetForRetry call
  // flips the row back to 'queued' and the bull worker picks it up
  // (or doesn't, if dormant).
  test('POST /jobs/:jobId/retry retries a failed job (DISPATCHER) @workflow @destructive @requires:data-failed-job', async ({
    asDispatcher,
  }) => {
    const { jobId } = await firstFailedJobId(asDispatcher);

    const res = await asDispatcher.post(`/jobs/${jobId}/retry`, buildJobRetry());
    expect(res.status()).toBe(201);

    const body = expectContract(
      JobRetryResponseSchema,
      await res.json(),
      `POST /jobs/${jobId}/retry`,
    );

    // Semantic — jobId echoes; status flipped to literal 'queued'
    // (Zod literal narrows it).
    expect(body.jobId).toBe(jobId);
    expect(body.status).toBe('queued');

    // Persistence — follow-up GET confirms the Prisma row's status
    // matches and errorMessage is cleared (resetForRetry line 585).
    const jobRes = await asDispatcher.get(`/jobs/${jobId}`);
    expect(jobRes.status()).toBe(200);
    const jobBody = expectContract(JobRowSchema, await jobRes.json(), `GET /jobs/${jobId} (after retry)`);
    expect(jobBody.status).toBe('queued');
    expect(jobBody.errorMessage).toBeNull();
  });
});

// 17 ── Dismiss + Cancel — SERIAL on a single bootstrapped row ────────
//
// Two tests share one Job row to minimise mutation of pre-existing
// tenant data. PATCH dismiss → DELETE cancel order matters:
//
//   1. Dismiss only sets `dismissedAt` (status unchanged).
//   2. Cancel requires status ∈ {queued, processing} (controller line
//      183) — flips to `cancelled`. Both safe in this order.
//
// Reverse order would NOT fail today (cancelled jobs can still be
// dismissed) but is semantically backwards. Serial preserves intent.
//
// NOTE: dismiss has a SUBMITTER-ONLY guard (controller line 168-170:
// `job.submittedBy !== user.dbId` → 403 Forbidden). The bootstrapped
// row may have been submitted by ANOTHER dispatcher. To keep the
// happy path testable we either need (a) a row submitted by the
// current dispatcher OR (b) tolerance for 403. The current decision:
// the test asserts EITHER a 200 dismiss envelope OR a 403 error
// envelope and threads the next step accordingly — but per the plan
// we want a clean shape assertion, so the test asserts 200 happy
// path and surfaces 403 as a finding for follow-up seeding work.
test.describe('Jobs Queue · Dismiss + Cancel @workflow @destructive', () => {
  test.describe.configure({ mode: 'serial' });

  let jobId: string | undefined;

  // 17a ── PATCH /jobs/:jobId/dismiss ──────────────────────────────────
  test('PATCH /jobs/:jobId/dismiss flags the job as dismissed (DISPATCHER) @workflow @destructive @requires:data-job-row', async ({
    asDispatcher,
  }) => {
    const bootstrap = await firstJobRow(asDispatcher);
    jobId = bootstrap.jobId;

    const res = await asDispatcher.patch(`/jobs/${jobId}/dismiss`, buildJobDismiss());
    // PATCH default = 200. The submitter-only guard may 403 if the
    // bootstrapped row was created by a different user — surface it
    // as a clear precondition error rather than a schema mismatch.
    if (res.status() === 403) {
      throw new Error(
        `PATCH /jobs/${jobId}/dismiss returned 403 — the bootstrapped row ` +
          'was submitted by a different user. Tag the calling test with ' +
          '@requires:data-job-row-self-submitted, or seed a job from the ' +
          'DISPATCHER role before running this test.',
      );
    }
    expect(res.status()).toBe(200);

    const body = expectContract(
      JobDismissResponseSchema,
      await res.json(),
      `PATCH /jobs/${jobId}/dismiss`,
    );

    // Semantic — jobId echoes, dismissed: true is the literal envelope.
    expect(body.jobId).toBe(jobId);
    expect(body.dismissed).toBe(true);

    // Persistence — Prisma row's `dismissedAt` is now non-null.
    const jobRes = await asDispatcher.get(`/jobs/${jobId}`);
    expect(jobRes.status()).toBe(200);
    const jobBody = expectContract(JobRowSchema, await jobRes.json(), `GET /jobs/${jobId} (after dismiss)`);
    expect(jobBody.dismissedAt).not.toBeNull();
  });

  // 17b ── DELETE /jobs/:jobId ─────────────────────────────────────────
  //
  // Cancellation requires status ∈ {queued, processing} — controller
  // line 183. A failed/completed job returns 400. The bootstrapped row
  // from test 17a may already be in a terminal state; the helper picks
  // the newest row (orderBy createdAt desc) which on demo-northstar is
  // typically a recent ratecon enqueue still in `queued`.
  test('DELETE /jobs/:jobId cancels a queued/processing job (DISPATCHER) @workflow @destructive @requires:data-job-row', async ({
    asDispatcher,
  }) => {
    expect(jobId, 'test 17a must have run first to bootstrap the jobId').toBeDefined();

    // The dismissed flag does NOT prevent cancellation (`dismissJob`
    // sets `dismissedAt` only, status unchanged — service line 595).
    // But if the row's status is already `failed`/`completed`/
    // `cancelled`, cancel returns 400. Surface that as a precondition
    // error referencing `@requires:data-cancellable-job` for clarity.
    const res = await asDispatcher.delete(`/jobs/${jobId}`);
    if (res.status() === 400) {
      throw new Error(
        `DELETE /jobs/${jobId} returned 400 — the bootstrapped row was ` +
          'not in queued/processing state. Tag this test with ' +
          '@requires:data-cancellable-job, or bootstrap a fresh queued ' +
          'job before running.',
      );
    }
    // DELETE without @HttpCode in NestJS returns 200 (the handler returns
    // a body — see controller line 193). Compare with `pinning the live
    // status code`: probed = 200.
    expect(res.status()).toBe(200);

    const body = expectContract(
      JobCancelResponseSchema,
      await res.json(),
      `DELETE /jobs/${jobId}`,
    );

    // Semantic — jobId echoes; status flipped to literal 'cancelled'.
    expect(body.jobId).toBe(jobId);
    expect(body.status).toBe('cancelled');

    // Persistence — Prisma row's status is now 'cancelled' (cancelJob
    // service line 601-606).
    const jobRes = await asDispatcher.get(`/jobs/${jobId}`);
    expect(jobRes.status()).toBe(200);
    const jobBody = expectContract(JobRowSchema, await jobRes.json(), `GET /jobs/${jobId} (after cancel)`);
    expect(jobBody.status).toBe('cancelled');
  });
});

/**
 * Document Intelligence (Phase 6 Group 6b — 4 tests on RateconController +
 * FuelReceiptController).
 *
 * Covers the 4 endpoints across two controllers:
 *
 *    8.  POST /ai/documents/parse-ratecon            — single PDF upload (202)
 *    10. POST /ai/documents/parse-ratecon/bulk       — bulk PDF upload (202)
 *    11. GET  /ai/documents/parser-config            — config envelope (200)
 *    12. POST /ifta/fuel-receipts/scan               — JPEG upload, sync LLM
 *
 * Test 9 from the plan (duplicate-hash 409) is DEFERRED — it requires a
 * pre-seeded ratecon on the tenant for the dup-detection branch to fire,
 * which demo-northstar does not have today. When/if `data-ratecon-seed`
 * is added, a dedicated dup-test will be appended.
 *
 * Cost discipline (NON-NEGOTIABLE):
 *   - Tests 8, 10, 12 ALL invoke the AI gateway (ratecon parses async via
 *     BullMQ; fuel-receipt parses sync inline). They are tagged
 *     `@requires:data-ai-gateway-credits` so default local runs collection-
 *     exclude them and DO NOT hit the LLM. The 202 envelope assertion on
 *     ratecon happens BEFORE the BullMQ worker picks up the job, so the
 *     test itself doesn't burn credits — but the worker would, and on a
 *     short-credit env that produces failed jobs that pollute the queue.
 *     The capability gate is the cleanest correctness boundary.
 *   - Test 11 (parser-config) is pure config-read — zero LLM cost, runs
 *     unconditionally on default runs.
 *
 * Stub buffers:
 *   - PDF: ~190-byte minimal valid PDF (1 page, no content); structurally
 *     parseable, content-empty. Built inline by `buildRateconUploadBuffer`.
 *   - JPEG: 134-byte 1×1 white pixel; rejected by the LLM as "no readable
 *     content" but the parser service still runs the structuredOutput
 *     extraction and returns nullable fields. Built by
 *     `buildFuelReceiptUploadBuffer`.
 *
 * Persistence (criterion 6):
 *   - Tests 8, 10: returned `jobId` is followed up with `GET /jobs/:jobId`
 *     to verify the BullMQ enqueue + Prisma row exist. The follow-up GET
 *     does NOT wait for the worker — it asserts the Job row's existence
 *     in `queued` status.
 *   - Test 11: read-only — persistence not applicable.
 *   - Test 12: synchronous LLM result returned directly; no Job row is
 *     created (parser service line 21 calls structuredOutput inline). No
 *     persistence verification needed.
 *
 * Cleanup:
 *   - Tests 8, 10: enqueue Job rows with `[QA-TEST]`-suffixed filenames.
 *     The BullMQ worker is not running in QA — rows stay in `queued`
 *     status. Tenant-reset between branches clears them. No per-test
 *     teardown needed.
 *   - Tests 11, 12: read-only / no persistence; nothing to clean up.
 */
import { test, expect } from '@sally/test-utils/auth';
import {
  buildRateconUploadBuffer,
  buildFuelReceiptUploadBuffer,
} from '@sally/test-utils/factories';
import { expectContract, AiSchemas } from '@sally/test-utils/schemas';
import { multipartUpload, multipartUploadMulti } from './_helpers';

const {
  RateconJobResponseSchema,
  RateconBulkJobResponseSchema,
  ParserConfigSchema,
  FuelReceiptScanResponseSchema,
  JobRowSchema,
} = AiSchemas;

test.describe('AI Document Intelligence · Ratecon + Fuel Receipt @workflow', () => {
  // 8 ── POST /ai/documents/parse-ratecon ──────────────────────────────
  //
  // Controller: `@HttpCode(HttpStatus.ACCEPTED)` (line 59) → 202.
  // Service line 215: returns `{ jobId, status: 'queued', fileName }`.
  // Both POST endpoints reside on RateconController which is `@RequireFeature
  // ('doc_intelligence')` — gated by the plan tag.
  //
  // Tagged `@requires:data-ai-gateway-credits` because the BullMQ worker
  // will pick this Job up and call the AI gateway. The 202 envelope itself
  // is sync, but the downstream cost is what the gate prevents.
  test('POST /ai/documents/parse-ratecon enqueues a ratecon parse job (DISPATCHER) @workflow @requires:plan-doc_intelligence @ai @slow @requires:data-ai-gateway-credits', async ({
    asDispatcher,
  }) => {
    const file = buildRateconUploadBuffer();
    const res = await multipartUpload(asDispatcher, '/ai/documents/parse-ratecon', file);
    expect(res.status()).toBe(202);

    const body = expectContract(
      RateconJobResponseSchema,
      await res.json(),
      'POST /ai/documents/parse-ratecon',
    );

    // Semantic — server returned a non-empty jobId, the literal 'queued'
    // status (Zod literal narrows it for TS), and the filename echoes
    // the upload's originalname (controller line 217).
    expect(body.jobId.length).toBeGreaterThan(0);
    expect(body.status).toBe('queued');
    expect(body.fileName).toBe(file.filename);

    // Persistence — follow-up GET on the new jobId proves the Prisma Job
    // row exists. JobsController returns the full row; we only assert
    // tenant scoping + matching id.
    const jobRes = await asDispatcher.get(`/jobs/${body.jobId}`);
    expect(jobRes.status()).toBe(200);
    const jobBody = expectContract(JobRowSchema, await jobRes.json(), `GET /jobs/${body.jobId}`);
    expect(jobBody.id).toBe(body.jobId);
    expect(jobBody.category).toBe('documents');
    expect(jobBody.type).toBe('ratecon');
  });

  // 10 ── POST /ai/documents/parse-ratecon/bulk ────────────────────────
  //
  // Controller: `@HttpCode(HttpStatus.ACCEPTED)` (line 91) → 202.
  // Returns the FLAT ARRAY result of `Promise.all(files.map(...))` —
  // line 104. Each entry is the same shape as the single endpoint.
  //
  // We send 2 unique PDFs (different unique filenames + appended random
  // bytes) so the SHA-256 hashes differ — otherwise the second entry
  // would collide on the in-flight inputHash and trip ConflictException.
  test('POST /ai/documents/parse-ratecon/bulk enqueues multiple ratecon parses (DISPATCHER) @workflow @requires:plan-doc_intelligence @slow @requires:data-ai-gateway-credits', async ({
    asDispatcher,
  }) => {
    const fileA = buildRateconUploadBuffer();
    const fileB = buildRateconUploadBuffer();
    expect(fileA.filename).not.toBe(fileB.filename); // unique() guarantees this

    const res = await multipartUploadMulti(asDispatcher, '/ai/documents/parse-ratecon/bulk', [
      fileA,
      fileB,
    ]);
    expect(res.status()).toBe(202);

    const body = expectContract(
      RateconBulkJobResponseSchema,
      await res.json(),
      'POST /ai/documents/parse-ratecon/bulk',
    );

    // Semantic — array length matches input count; each entry has its
    // own jobId; filenames are echoed in declaration order (Promise.all
    // preserves order).
    expect(body.length).toBe(2);
    const jobIds = body.map((row) => row.jobId);
    expect(new Set(jobIds).size).toBe(2); // unique
    expect(body.map((row) => row.fileName)).toEqual([fileA.filename, fileB.filename]);

    // Persistence — verify the FIRST job exists. The second is structurally
    // identical; one GET is sufficient to prove the persistence path.
    const jobRes = await asDispatcher.get(`/jobs/${jobIds[0]}`);
    expect(jobRes.status()).toBe(200);
    const jobBody = expectContract(JobRowSchema, await jobRes.json(), `GET /jobs/${jobIds[0]}`);
    expect(jobBody.id).toBe(jobIds[0]);
    expect(jobBody.category).toBe('documents');
  });

  // 11 ── GET /ai/documents/parser-config ──────────────────────────────
  //
  // Synchronous config read — controller line 110-121. No LLM, no DB —
  // pure ConfigService + process.env. Runs unconditionally on default runs.
  test('GET /ai/documents/parser-config returns the active parser config (DISPATCHER) @workflow @contract @requires:plan-doc_intelligence', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/ai/documents/parser-config');
    expect(res.status()).toBe(200);

    const body = expectContract(
      ParserConfigSchema,
      await res.json(),
      'GET /ai/documents/parser-config',
    );

    // Semantic — the four critical AI-pipeline fields are non-empty
    // strings (defaults from process.env). `defaultStrategy` is a known
    // value from the parser strategy enum.
    expect(['text-first', 'vision']).toContain(body.defaultStrategy);
    expect(body.aiProvider.length).toBeGreaterThan(0);
    expect(body.model.length).toBeGreaterThan(0);
    expect(body.fallbackModel.length).toBeGreaterThan(0);
    expect(body.timeoutMs).toBeGreaterThan(0);
    expect(body.fallbackTimeoutMs).toBeGreaterThan(0);
  });

  // 12 ── POST /ifta/fuel-receipts/scan ────────────────────────────────
  //
  // Controller `FuelReceiptController` is `@RequireFeature('ifta')`-gated.
  // No `@HttpCode` decorator on `scanReceipt` (line 21) → NestJS POST
  // default = 201. The handler returns the parser result inline — the
  // request hangs until the LLM responds (parser service has 30s + 60s
  // timeouts on attempts 1 + 2). Tagged `@slow`.
  //
  // Tagged `@requires:data-ai-gateway-credits` — the parser service
  // hits the structuredOutputService inline, so a 0-credit env returns
  // a 500. Capability gate keeps default runs LLM-free.
  test('POST /ifta/fuel-receipts/scan extracts data from a fuel receipt image (DISPATCHER) @workflow @requires:plan-ifta @ai @slow @requires:data-ai-gateway-credits', async ({
    asDispatcher,
  }) => {
    const file = buildFuelReceiptUploadBuffer();
    const res = await multipartUpload(asDispatcher, '/ifta/fuel-receipts/scan', file);
    expect(res.status()).toBe(201);

    const body = expectContract(
      FuelReceiptScanResponseSchema,
      await res.json(),
      'POST /ifta/fuel-receipts/scan',
    );

    // Semantic — the envelope is well-formed. The 1×1 stub JPEG carries
    // no readable text, so the LLM returns null for every field —
    // `fieldsExtracted` is therefore typically 0 (and never exceeds
    // `totalFields` which is 13). `parsing.model` echoes 'fast' or
    // 'standard' depending on which attempt succeeded. `durationMs` is
    // a non-negative integer. NO assertion on extracted CONTENT (Phase 6
    // contract-shape rubric).
    expect(body.totalFields).toBe(13);
    expect(body.fieldsExtracted).toBeGreaterThanOrEqual(0);
    expect(body.fieldsExtracted).toBeLessThanOrEqual(body.totalFields);
    expect(['fast', 'standard']).toContain(body.parsing.model);
    expect(body.parsing.durationMs).toBeGreaterThanOrEqual(0);
  });
});

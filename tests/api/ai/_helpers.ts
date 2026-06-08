/**
 * Shared helpers for the Phase 6 AI spec suite.
 *
 * Group 6a owns the streaming-frame helper. Later groups (6b-6f) will
 * extend this file with file-upload helpers (multipart/form-data),
 * prospect session helpers, and MCP token minting helpers.
 *
 * Streaming protocol reminder — see `packages/test-utils/src/schemas/ai.ts`
 * header for the full spec. Each emitted line is `<prefix>:<json>\n`
 * where `<prefix>` ∈ `{0, 8, 9, a}` (sally-ai.service.ts:415-427).
 *
 * The whole line is NOT a single JSON document. Tests that reach for
 * `JSON.parse(firstLine)` will fail — they must split on the first
 * colon to pull the discriminator off before parsing the payload.
 */
import type { APIResponse } from '@playwright/test';
import type { RoleApiClient } from '@sally/test-utils/playwright';

/**
 * Shape of a normalised AI-SDK data-stream frame. Matches
 * `SallyAiStreamFrameSchema` in `@sally/test-utils/schemas/ai` — the
 * schema validates what this helper produces.
 */
export interface SallyAiFrame {
  kind: string;
  payload: unknown;
}

/**
 * Drain a streaming Sally AI response and return the FIRST observable
 * AI-SDK data-stream frame.
 *
 * Playwright's `APIResponse.text()` waits for the stream to complete
 * and returns the full body. We don't care about completion semantics
 * here — `readFirstStreamFrame` only inspects the first non-empty line
 * and parses its `<prefix>:<json>` payload. Subsequent frames (model
 * text, tool calls) are out of scope for Phase 6 (contract-shape only;
 * no LLM output-quality assertions).
 *
 * Throws a descriptive error if the body is empty, the first line is
 * missing the expected `<prefix>:<json>` separator, or the payload is
 * not valid JSON. Tests catch the error to assert specific shapes.
 */
export async function readFirstStreamFrame(res: APIResponse): Promise<SallyAiFrame> {
  const body = await res.text();
  if (!body) {
    throw new Error(
      `readFirstStreamFrame: empty response body (HTTP ${res.status()}) — ` +
        'the stream closed without emitting any frames. Common causes: ' +
        'AI gateway has zero credits (tag @requires:data-ai-gateway-credits) ' +
        'or the server 500-errored before the first write.',
    );
  }

  // Strip SSE `data: ` prefix tolerantly — the AI-SDK data-stream
  // protocol does NOT use SSE today, but future migrations might.
  // Pick the first line that contains any non-whitespace content.
  const firstLine = body.split('\n').find((line) => line.trim().length > 0);
  if (!firstLine) {
    throw new Error(
      `readFirstStreamFrame: no non-empty line in response body (HTTP ${res.status()}) — ` +
        `raw body: ${JSON.stringify(body.slice(0, 200))}`,
    );
  }

  const normalised = firstLine.startsWith('data: ') ? firstLine.slice(6) : firstLine;

  const colonIdx = normalised.indexOf(':');
  if (colonIdx <= 0) {
    throw new Error(
      `readFirstStreamFrame: first line is missing the '<prefix>:<json>' separator — ` +
        `raw line: ${JSON.stringify(normalised.slice(0, 200))}`,
    );
  }

  const kind = normalised.slice(0, colonIdx);
  const jsonPart = normalised.slice(colonIdx + 1);

  let payload: unknown;
  try {
    payload = JSON.parse(jsonPart);
  } catch (err) {
    throw new Error(
      `readFirstStreamFrame: failed to JSON.parse the first-frame payload — ` +
        `kind=${JSON.stringify(kind)}, payload=${JSON.stringify(jsonPart.slice(0, 200))}, ` +
        `error=${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return { kind, payload };
}

// ── PHASE 6 GROUP 6b — MULTIPART UPLOAD + JOB BOOTSTRAP ─────────────

/**
 * Send a `multipart/form-data` request via a `RoleApiClient`.
 *
 * Playwright's `APIRequestContext.post` natively supports a `multipart`
 * option (typed as `{ [name: string]: string | number | boolean | ReadStream
 * | { name; mimeType; buffer } }`). Our `RoleApiClient` wrapper threads
 * `data` AND the rest of the options through to Playwright; passing
 * `data: undefined` alongside `multipart: {...}` is fine — Playwright
 * inspects `multipart` first and uses it as the body when present.
 *
 * `extraFields` is for non-file form fields (e.g. text inputs sharing the
 * same multipart body). All ratecon + fuel-receipt endpoints accept ONLY
 * a single `file` field today (no extra metadata in the body — strategy
 * + force come in via querystring), so the parameter is optional.
 */
export async function multipartUpload(
  client: RoleApiClient,
  path: string,
  file: { buffer: Buffer; filename: string; mimeType: string },
  extraFields?: Record<string, string>,
  fieldName: string = 'file',
): Promise<APIResponse> {
  // The role-client wrapper accepts (url, data, options); we pass data
  // as undefined and let Playwright pick up `multipart` from options.
  return client.post(path, undefined, {
    multipart: {
      ...(extraFields ?? {}),
      [fieldName]: {
        name: file.filename,
        mimeType: file.mimeType,
        buffer: file.buffer,
      },
    },
    // 30s timeout — file uploads + S3 round-trip can stall briefly even
    // for a tiny stub buffer.
    timeout: 30_000,
  });
}

/**
 * Multi-file variant for `POST /ai/documents/parse-ratecon/bulk` —
 * controller line 92 expects field name `files` with up to 10 PDFs.
 * Playwright's multipart option is a flat dict and doesn't support
 * arrays; instead, we use the underlying APIRequestContext via a
 * different helper. But since our wrapper forwards `multipart` directly
 * to Playwright, and Playwright's typing only allows ONE entry per
 * key, multi-file uploads need form-data construction by hand.
 *
 * Workaround: use the same `files` key for each file — Playwright sets
 * the same field name for each entry when given a flat object, so we
 * pass an object with numeric-suffixed keys and rely on the controller's
 * `FilesInterceptor('files', ...)` to collect them. Inspecting Multer:
 * `FilesInterceptor('files', N)` accepts ANY entry whose form-field
 * name is `files` — but Playwright won't emit the same key twice from
 * a flat dict.
 *
 * Robust path: build the body manually as a multi-part stream. We use
 * Node's built-in form-data construction. For brevity we fall through
 * to a single multipart with `files` repeated — modern Playwright
 * (>= 1.41) accepts an ARRAY value at a single key when sending
 * multipart; verified at https://playwright.dev/docs/api/class-apirequestcontext.
 */
export async function multipartUploadMulti(
  client: RoleApiClient,
  path: string,
  files: Array<{ buffer: Buffer; filename: string; mimeType: string }>,
  fieldName: string = 'files',
): Promise<APIResponse> {
  // Playwright's `multipart` option accepts an array of file specs at a
  // single key (each is sent as a separate part with the same name).
  // The cast is necessary because the public type only documents the
  // single-file form, but the underlying `multipart/form-data` builder
  // in `playwright-core/lib/utils/multipartFormData.ts` iterates
  // `Array.isArray(value)` correctly.
  const fileSpecs = files.map((f) => ({
    name: f.filename,
    mimeType: f.mimeType,
    buffer: f.buffer,
  }));

  return client.post(path, undefined, {
    multipart: {
      [fieldName]: fileSpecs as unknown as { name: string; mimeType: string; buffer: Buffer },
    },
    timeout: 30_000,
  });
}

/**
 * Bootstrap helper — return the id of the first Job row visible to the
 * caller's tenant. Throws a clear error referencing the
 * `@requires:data-job-row` tag so collection-excluded tests fail
 * loudly when the operator forgets to flip the capability.
 */
export async function firstJobRow(asDispatcher: RoleApiClient): Promise<{ jobId: string }> {
  const res = await asDispatcher.get('/jobs?limit=1');
  if (res.status() !== 200) {
    throw new Error(
      `firstJobRow: GET /jobs returned HTTP ${res.status()} — ` +
        `tag the calling test with @requires:data-job-row.`,
    );
  }
  const body = (await res.json()) as { items: Array<{ id: string }> };
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new Error(
      'firstJobRow: GET /jobs returned 0 rows — tag the calling test ' +
        'with @requires:data-job-row so it collection-excludes when no Job exists.',
    );
  }
  return { jobId: body.items[0].id };
}

// ── PHASE 6 GROUP 6c — PROSPECT + VOICE ─────────────────────────────

/**
 * Bootstrap a fresh prospect conversation as `asAnonymous` and return
 * the `(conversationId, sessionToken)` pair. Each call hits the public
 * `POST /prospect/conversations` endpoint — the controller is throttled
 * to 5 conversations per hour per IP, which is safe for the Group 6c
 * test budget (3 prospect tests max).
 *
 * The returned `sessionToken` is used as the `x-session-token` header
 * value on subsequent `:id/messages` calls (controller lines 29, 44).
 *
 * On failure, throws a descriptive error referencing the throttle limit
 * so collection-skipped tests fail loudly when the budget is exhausted.
 */
export async function prospectSession(
  asAnonymous: RoleApiClient,
): Promise<{ conversationId: string; sessionToken: string }> {
  const res = await asAnonymous.post('/prospect/conversations', {});
  if (res.status() !== 201) {
    throw new Error(
      `prospectSession: POST /prospect/conversations returned HTTP ${res.status()} — ` +
        'the public endpoint is throttled to 5 conversations / hour per IP. ' +
        'Wait for the throttle window to reset or restart the backend.',
    );
  }
  const body = (await res.json()) as { conversationId: string; sessionToken: string };
  return { conversationId: body.conversationId, sessionToken: body.sessionToken };
}

/**
 * Read the FIRST NDJSON frame from a streaming response where each line
 * is a SINGLE JSON document (NOT the AI-SDK `<prefix>:<json>` protocol).
 *
 * Used by `POST /voice/internal/respond` (voice.controller.ts:89-91) which
 * writes `JSON.stringify(chunk) + '\n'` per chunk. The returned object
 * has shape `{type, data}` — schema is `VoiceInternalRespondFrameSchema`
 * in `@sally/test-utils/schemas/ai`.
 *
 * Throws a descriptive error when the body is empty / unparseable. The
 * test catches the throw to assert specific shapes.
 */
export async function readFirstNdjsonFrame(res: APIResponse): Promise<unknown> {
  const body = await res.text();
  if (!body) {
    throw new Error(
      `readFirstNdjsonFrame: empty response body (HTTP ${res.status()}) — ` +
        'the stream closed without emitting any frames. Common causes: ' +
        'AI gateway has zero credits (tag @requires:data-ai-gateway-credits), ' +
        'shared secret mismatch (tag @requires:data-voice-agent-secret), ' +
        'or the server 500-errored before the first write.',
    );
  }
  const firstLine = body.split('\n').find((line) => line.trim().length > 0);
  if (!firstLine) {
    throw new Error(
      `readFirstNdjsonFrame: no non-empty line in response body (HTTP ${res.status()}) — ` +
        `raw body: ${JSON.stringify(body.slice(0, 200))}`,
    );
  }
  try {
    return JSON.parse(firstLine);
  } catch (err) {
    throw new Error(
      `readFirstNdjsonFrame: failed to JSON.parse the first NDJSON line — ` +
        `raw line: ${JSON.stringify(firstLine.slice(0, 200))}, ` +
        `error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Bootstrap helper — return the id of the first Job with status='failed'.
 * Throws (with `@requires:data-failed-job` reference) when no failed job
 * exists. POST /jobs/:id/retry's controller (line 102) only retries
 * failed jobs (BadRequestException otherwise), so this gate is essential.
 */
export async function firstFailedJobId(asDispatcher: RoleApiClient): Promise<{ jobId: string }> {
  const res = await asDispatcher.get('/jobs?status=failed&limit=1');
  if (res.status() !== 200) {
    throw new Error(
      `firstFailedJobId: GET /jobs?status=failed returned HTTP ${res.status()} — ` +
        `tag the calling test with @requires:data-failed-job.`,
    );
  }
  const body = (await res.json()) as { items: Array<{ id: string; status: string }> };
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new Error(
      'firstFailedJobId: no failed jobs on tenant — tag the calling test ' +
        'with @requires:data-failed-job.',
    );
  }
  return { jobId: body.items[0].id };
}

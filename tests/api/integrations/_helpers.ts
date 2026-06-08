/**
 * Shared setup helpers for the Phase 5 integrations spec suite. Every
 * helper follows the `tests/api/platform/_helpers.ts` convention —
 * typed returns, throw-with-descriptive-error-naming-the-tag when a
 * precondition can't be bootstrapped.
 *
 * Group 5a uses the two helpers below; later groups (5b-5f) will
 * extend this file with EDI / accounting / load-board helpers.
 *
 * Notes on IntegrationConfig row lifecycle:
 *   - POST /integrations returns 201 + `{id: 'int_<uuid>', ...}` — `id`
 *     is the STRING integrationId (not the numeric DB id).
 *   - The `@@unique([tenantId, integrationType, vendor])` constraint
 *     means a second POST with the same type + vendor returns 400
 *     "Integration already exists …". The helpers here pick a vendor
 *     combo that's NOT already seeded on demo-northstar-2026 (which
 *     already has DAT_LOAD_BOARD + SAMSARA_ELD rows) — MCLEOD_TMS is
 *     the safe default because neither demo tenant seeds a TMS row.
 *   - DELETE returns 200 + `{success: true}` (NOT 204).
 */
import * as crypto from 'node:crypto';
import { expect } from '@playwright/test';
import type { RoleApiClient } from '@sally/test-utils/playwright';
import { buildIntegrationCreate, buildLoadBoardSearch } from '@sally/test-utils/factories';

// ── createScopedIntegration ──────────────────────────────────────────

export interface ScopedIntegration {
  /** The string integrationId (what the API uses on all paths). */
  integrationId: string;
  integrationType: string;
  vendor: string;
  displayName: string;
  /** Idempotent cleanup — DELETE the row. Safe to call twice. */
  cleanup: () => Promise<void>;
}

/**
 * Create a fresh IntegrationConfig via POST /integrations and return
 * the integrationId + a cleanup closure. The caller MUST wire up
 * `cleanup()` in an afterEach / try-finally.
 *
 * The `asCreator` role must be ADMIN/OWNER — the controller is
 * `@Roles(ADMIN, OWNER)`-gated.
 *
 * Default vendor is MCLEOD_TMS (see buildIntegrationCreate for why).
 * Override via `vendor` when the test specifically needs a Samsara
 * / QuickBooks / Motive row.
 */
export async function createScopedIntegration(
  asCreator: RoleApiClient,
  vendor: string = 'MCLEOD_TMS',
  overrides: Record<string, unknown> = {},
): Promise<ScopedIntegration> {
  const payload = buildIntegrationCreate(vendor, overrides);
  const res = await asCreator.post('/integrations', payload);
  expect(res.status(), `createScopedIntegration bootstrap POST /integrations (${vendor}) should return 201`).toBe(201);
  const body = (await res.json()) as {
    id?: string;
    integrationType?: string;
    vendor?: string;
    displayName?: string;
  };
  if (
    typeof body.id !== 'string' ||
    typeof body.integrationType !== 'string' ||
    typeof body.vendor !== 'string' ||
    typeof body.displayName !== 'string'
  ) {
    throw new Error(`createScopedIntegration: unexpected POST /integrations shape — ${JSON.stringify(body)}`);
  }

  const integrationId = body.id;
  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    const del = await asCreator.delete(`/integrations/${integrationId}`);
    // 200 = happy delete, 404 = already gone (e.g. test 8 DELETEs it
    // as the assertion). Anything else logs but doesn't throw — we
    // don't want a cleanup hiccup to mask a real failure.
    if (del.status() !== 200 && del.status() !== 404 && del.status() !== 204) {
      // eslint-disable-next-line no-console
      console.error(
        `createScopedIntegration.cleanup: DELETE /integrations/${integrationId} returned ` +
          `HTTP ${del.status()} — row may remain.`,
      );
    }
  };

  return {
    integrationId,
    integrationType: body.integrationType,
    vendor: body.vendor,
    displayName: body.displayName,
    cleanup,
  };
}

// ── firstEnabledIntegrationId ────────────────────────────────────────

export interface DiscoveredIntegration {
  integrationId: string;
  integrationType: string;
  vendor: string;
  displayName: string;
  isEnabled: boolean;
  status: string;
}

/**
 * Pick the first integration on the tenant, optionally filtered by
 * vendor. Used by tests that need a PRE-EXISTING integration (e.g.
 * invoice/settlement sync) rather than one they created themselves.
 *
 * Throws with an error message that names the `@requires:data-*` tag
 * the caller SHOULD apply, so the test gets collection-excluded when
 * no integration is seeded.
 *
 * Does NOT filter on `isEnabled`/`status` by default — many demo
 * tenants have integrations in ERROR status (credentials not wired)
 * but the row still exists and is a valid discovery target for
 * endpoints that only need the row, not a working connection.
 * Pass `{ onlyEnabled: true }` to restrict.
 */
export async function firstEnabledIntegrationId(
  asAdmin: RoleApiClient,
  options: { vendor?: string; onlyEnabled?: boolean } = {},
): Promise<DiscoveredIntegration> {
  const res = await asAdmin.get('/integrations');
  expect(res.status(), 'firstEnabledIntegrationId bootstrap GET /integrations should return 200').toBe(200);
  const body = (await res.json()) as unknown;
  const list = Array.isArray(body)
    ? (body as Array<{
        id?: string;
        integrationType?: string;
        vendor?: string;
        displayName?: string;
        isEnabled?: boolean;
        status?: string;
      }>)
    : [];

  const candidates = list.filter(
    (r) =>
      typeof r.id === 'string' &&
      typeof r.integrationType === 'string' &&
      typeof r.vendor === 'string' &&
      typeof r.displayName === 'string' &&
      typeof r.isEnabled === 'boolean' &&
      typeof r.status === 'string' &&
      (!options.vendor || r.vendor === options.vendor) &&
      (!options.onlyEnabled || r.isEnabled === true),
  );

  const picked = candidates[0];
  if (!picked) {
    const filterDesc = options.vendor ? ` (vendor=${options.vendor})` : '';
    throw new Error(
      `firstEnabledIntegrationId: no integration${filterDesc} on this tenant — ` +
        'tag test @requires:data-active-integration. Seed an integration via ' +
        'POST /integrations or flip TESTS_DATA_CAPABILITIES=active-integration ' +
        'after verifying GET /integrations returns a matching row.',
    );
  }
  return {
    integrationId: picked.id!,
    integrationType: picked.integrationType!,
    vendor: picked.vendor!,
    displayName: picked.displayName!,
    isEnabled: picked.isEnabled!,
    status: picked.status!,
  };
}

// ── Accounting (Phase 5 Group 5c) ────────────────────────────────────

/**
 * HMAC-SHA256 over the raw body with the Intuit webhook verifier token,
 * base64-encoded. This is EXACTLY what
 * `QuickBooksAdapter.validateWebhookSignature` expects in the
 * `intuit-signature` header (quickbooks.adapter.ts lines 542–549).
 *
 * The caller MUST hash the EXACT bytes sent over the wire. Playwright's
 * `request.post(url, {data: <object>})` serialises via `JSON.stringify` —
 * which can produce different whitespace/key-ordering than the
 * object literal. Safe pattern: `const raw = JSON.stringify(payloadObj)`,
 * pass `{data: raw, headers: {'content-type': 'application/json'}}`, then
 * sign `raw` with this helper.
 */
export function signIntuitWebhook(rawBody: string, verifierToken: string): string {
  return crypto.createHmac('sha256', verifierToken).update(rawBody).digest('base64');
}

/**
 * Ensure an ACCOUNTING integration exists on the tenant (creates a
 * QUICKBOOKS row if none present, returns the id + a cleanup closure).
 *
 * Why bootstrap here instead of reusing `firstEnabledIntegrationId`:
 * demo-northstar-2026 ships zero ACCOUNTING rows, and the controller's
 * `getIntegrationConfig` throws 404 when none exists. QUICKBOOKS is
 * OAuth-only in the vendor registry — but `POST /integrations` accepts
 * the create without credentials (optional field) and the row lands at
 * `isEnabled: true, status: 'CONFIGURED'` (verified live). That's
 * enough for the mapping-list / external-entities / account-mappings
 * / sync endpoints to proceed past the 404.
 *
 * Credentials are NOT required for the endpoints in this group:
 *   - Status returns `{connected: false}` without credentials.
 *   - Mapping / external-entity GETs return `[]` (service only reads
 *     local DB tables, never calls QB).
 *   - Sync POSTs enqueue a Job row and return `{success, jobId}` (the
 *     Bull worker will fail later but the HTTP contract is satisfied).
 */
export async function ensureAccountingIntegration(
  asAdmin: RoleApiClient,
): Promise<{ integrationId: string; cleanup: () => Promise<void> }> {
  // 1. Short-circuit if an ACCOUNTING row already exists.
  const listRes = await asAdmin.get('/integrations');
  expect(listRes.status(), 'ensureAccountingIntegration: GET /integrations').toBe(200);
  const list = (await listRes.json()) as Array<{ id: string; integrationType: string; isEnabled: boolean }>;
  const existing = list.find((r) => r.integrationType === 'ACCOUNTING' && r.isEnabled);
  if (existing) {
    return {
      integrationId: existing.id,
      // Don't delete pre-existing rows — they may be seeded or
      // belong to a sibling test. No-op cleanup.
      cleanup: async () => {},
    };
  }

  // 2. Bootstrap a QUICKBOOKS row. Under `--workers=2` two tests can
  //    race this POST; the `@@unique([tenantId, integrationType, vendor])`
  //    constraint makes the second one return 400 "Integration already
  //    exists" (service-layer error before Prisma). Handle by re-reading
  //    the list and picking the row that the winning worker created.
  const createRes = await asAdmin.post('/integrations', {
    integrationType: 'ACCOUNTING',
    vendor: 'QUICKBOOKS',
    displayName: `[QA-TEST] QB bootstrap ${Date.now()}`,
  });

  if (createRes.status() === 400 || createRes.status() === 409) {
    // Race lost — the sibling worker created the row first. Re-fetch
    // and pick it up. No cleanup (the winner owns that).
    const reListRes = await asAdmin.get('/integrations');
    expect(reListRes.status(), 'ensureAccountingIntegration: GET /integrations (race recovery)').toBe(200);
    const reList = (await reListRes.json()) as Array<{ id: string; integrationType: string; isEnabled: boolean }>;
    const raced = reList.find((r) => r.integrationType === 'ACCOUNTING' && r.isEnabled);
    if (!raced) {
      throw new Error(
        `ensureAccountingIntegration: create returned HTTP ${createRes.status()} ` +
          'but re-listing yielded no ACCOUNTING row — tenant state is unexpected.',
      );
    }
    return {
      integrationId: raced.id,
      cleanup: async () => {},
    };
  }

  expect(createRes.status(), 'ensureAccountingIntegration: POST /integrations').toBe(201);
  const body = (await createRes.json()) as { id: string };
  const integrationId = body.id;

  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    try {
      const del = await asAdmin.delete(`/integrations/${integrationId}`);
      if (del.status() !== 200 && del.status() !== 404) {
        // eslint-disable-next-line no-console
        console.error(
          `ensureAccountingIntegration.cleanup: DELETE /integrations/${integrationId} returned HTTP ${del.status()}`,
        );
      }
    } catch {
      // Request context torn down — ignore.
    }
  };

  return { integrationId, cleanup };
}

/**
 * Return the first customer-entity mapping row, or throw with a
 * `@requires:data-accounting-mapping` error naming the tag.
 *
 * Mappings are created by the auto-match step of the initial-sync
 * flow (accounting-mapping.service.ts::autoMatchCustomers), which in
 * turn requires real QB credentials to fetch external customers.
 * demo-northstar-2026 has none — so this helper always throws on dev
 * unless the operator has seeded mappings via a different path and
 * flipped `TESTS_DATA_CAPABILITIES=accounting-mapping`.
 */
export async function firstAccountingMapping(
  asAdmin: RoleApiClient,
  entityType: 'customer' | 'vendor' | 'class' = 'customer',
): Promise<{ id: number }> {
  const res = await asAdmin.get(`/accounting/mappings/${entityType}`);
  expect(res.status(), `firstAccountingMapping: GET /accounting/mappings/${entityType}`).toBe(200);
  const rows = (await res.json()) as Array<{ id: number }>;
  const picked = rows[0];
  if (!picked) {
    throw new Error(
      `firstAccountingMapping(${entityType}): no mapping rows on this tenant — ` +
        'tag test @requires:data-accounting-mapping. Seed mappings by running ' +
        'POST /accounting/setup/initial-sync with real QB credentials OR flip ' +
        'TESTS_DATA_CAPABILITIES=accounting-mapping after verifying ' +
        `GET /accounting/mappings/${entityType} returns a non-empty list.`,
    );
  }
  return { id: picked.id };
}

// ── EDI (Phase 5 Group 5d) ───────────────────────────────────────────

/**
 * HMAC-SHA256 over the raw body with the EDI webhook secret, formatted
 * as `sha256=<hex>`. Matches `edi-webhook.controller.ts:84` —
 * `const expectedSignature = 'sha256=' + crypto.createHmac('sha256',
 * webhookSecret).update(payloadStr).digest('hex')`.
 *
 * Same raw-body invariant as `signIntuitWebhook` — hash the EXACT
 * bytes the server will read. Stringify once, sign that string, send
 * the string as `data`.
 */
export function signEdiWebhook(rawBody: string, secret: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

/**
 * Return the first pending EDI tender load for the current tenant, or
 * throw with a `@requires:data-edi-tender` error naming the tag.
 *
 * "Pending" means: a Load created from an inbound T204 that is still
 * in `TENDER` status (not yet responded to). Service ::findPendingTenders
 * returns EDIMessage rows — each row's `loadId` column is the target
 * for POST /edi/tenders/:loadId/respond.
 *
 * demo-northstar-2026 does NOT seed EDI tenders. The only ingress is
 * the webhook (which is unreachable on dev — see finding #43). So this
 * helper always throws on a default dev run; the consuming test carries
 * `@requires:data-edi-tender` and is collection-excluded by default.
 */
export async function firstPendingEdiTender(asDispatcher: RoleApiClient): Promise<{ loadId: number }> {
  const res = await asDispatcher.get('/edi/tenders');
  expect(res.status(), 'firstPendingEdiTender: GET /edi/tenders').toBe(200);
  const rows = (await res.json()) as Array<{ loadId?: number | null }>;
  const picked = rows.find((r) => typeof r.loadId === 'number');
  if (!picked || typeof picked.loadId !== 'number') {
    throw new Error(
      'firstPendingEdiTender: no pending EDI tenders on this tenant — ' +
        'tag test @requires:data-edi-tender. Inbound tenders arrive via ' +
        'POST /edi/webhooks/:tenantId (gated on EDI_WEBHOOK_SECRET, see ' +
        'finding #43). After seeding a tender, flip ' +
        'TESTS_DATA_CAPABILITIES=edi-tender.',
    );
  }
  return { loadId: picked.loadId };
}

/**
 * Return the first Sally-suggested auto-accept rule in pending-approval
 * state, or throw with a `@requires:data-edi-suggested-rule` error.
 *
 * "Pending approval" means: `createdBy === 'sally_suggested'` AND
 * `approvedAt === null`. The approve endpoint flips `approvedAt` to
 * `new Date()`. Dev demo tenants do NOT ship suggested rules.
 */
export async function firstSuggestedEdiRule(asDispatcher: RoleApiClient): Promise<{ ruleId: number }> {
  const res = await asDispatcher.get('/edi/tenders/rules');
  expect(res.status(), 'firstSuggestedEdiRule: GET /edi/tenders/rules').toBe(200);
  const rows = (await res.json()) as Array<{
    id?: number;
    createdBy?: string;
    approvedAt?: string | null;
  }>;
  const picked = rows.find(
    (r) => r.createdBy === 'sally_suggested' && (r.approvedAt === null || r.approvedAt === undefined),
  );
  if (!picked || typeof picked.id !== 'number') {
    throw new Error(
      'firstSuggestedEdiRule: no pending Sally-suggested auto-accept rules ' +
        'on this tenant — tag test @requires:data-edi-suggested-rule. ' +
        'Suggested rules are created by the Sally AI subsystem (no public ' +
        'POST path); seed one manually and flip ' +
        'TESTS_DATA_CAPABILITIES=edi-suggested-rule.',
    );
  }
  return { ruleId: picked.id };
}

// ── Email intake (Phase 5 Group 5e) ──────────────────────────────────

/**
 * Return the first EmailIngestThread id for the current tenant, or throw
 * with a `@requires:data-email-intake-thread` error naming the tag.
 *
 * Threads are created exclusively by the Resend inbound webhook when a
 * recipient address resolves to the tenant (email-intake.service.ts
 * ::resolveTenant → processInboundEmail). Demo-northstar-2026 ships zero
 * threads — the consuming tests carry the `@requires:data-email-intake-thread`
 * tag and are collection-excluded on a default dev run.
 *
 * The list endpoint returns a paged envelope `{data[], total, page,
 * limit, totalPages}` — we pick `data[0]`. The thread status doesn't
 * matter for the helper; consuming tests that require a specific status
 * (e.g. `restore` needs a DISCARDED thread) check locally.
 */
export async function firstEmailIntakeThread(
  asAdmin: RoleApiClient,
): Promise<{ threadId: string }> {
  const res = await asAdmin.get('/integrations/email-intake/threads');
  expect(res.status(), 'firstEmailIntakeThread: GET /integrations/email-intake/threads').toBe(200);
  const body = (await res.json()) as { data?: Array<{ id?: string }> };
  const picked = body?.data?.[0];
  if (!picked || typeof picked.id !== 'string') {
    throw new Error(
      'firstEmailIntakeThread: no EmailIngestThread rows on this tenant — ' +
        'tag test @requires:data-email-intake-thread. Seed a thread by ' +
        'POSTing a legacy-flat payload to /integrations/email-intake/webhook ' +
        "whose `to[0]` matches the tenant's `inboundAddress` (from GET " +
        '/integrations/email-intake/settings) AND flip ' +
        'TESTS_DATA_CAPABILITIES=email-intake-thread after verifying ' +
        'GET /integrations/email-intake/threads returns a non-empty `data[]`.',
    );
  }
  return { threadId: picked.id };
}

/**
 * Return the first EmailIngestAttachment id for the current tenant, or
 * throw with a `@requires:data-email-intake-attachment` error.
 *
 * Strategy: fetch the thread list (paged — service includes attachments
 * via `messages.attachments` with `where: {isLatestVersion: true}`), then
 * pick the first thread that has any message with any attachment.
 *
 * Strict subset of `email-intake-thread` — if NO threads exist, this
 * helper throws for the thread tag; if threads exist but none carry
 * attachments it throws the attachment tag. Consuming test (test 57)
 * carries both tags so the operator can enable either independently.
 */
export async function firstEmailIntakeAttachment(
  asAdmin: RoleApiClient,
): Promise<{ attachmentId: string }> {
  const res = await asAdmin.get('/integrations/email-intake/threads');
  expect(res.status(), 'firstEmailIntakeAttachment: GET /integrations/email-intake/threads').toBe(200);
  const body = (await res.json()) as {
    data?: Array<{
      messages?: Array<{ attachments?: Array<{ id?: string }> }>;
    }>;
  };

  for (const thread of body?.data ?? []) {
    for (const msg of thread.messages ?? []) {
      for (const att of msg.attachments ?? []) {
        if (typeof att.id === 'string') {
          return { attachmentId: att.id };
        }
      }
    }
  }

  throw new Error(
    'firstEmailIntakeAttachment: no EmailIngestAttachment rows on this tenant — ' +
      'tag test @requires:data-email-intake-attachment. Seed an attachment by ' +
      'POSTing a legacy-flat payload to /integrations/email-intake/webhook with a ' +
      'non-empty `attachments[]` array AND flip ' +
      'TESTS_DATA_CAPABILITIES=email-intake-attachment after verifying a thread ' +
      'with `messages[].attachments[]` surfaces on GET /integrations/email-intake/threads.',
  );
}

/**
 * Return the first account-mapping row, or throw with a
 * `@requires:data-accounting-account-mapping` error naming the tag.
 * Same seeding story as `firstAccountingMapping` — these rows are
 * created by `createDefaultAccountMappings` during initial sync, which
 * requires real QB credentials.
 */
export async function firstAccountingAccountMapping(asAdmin: RoleApiClient): Promise<{ id: number }> {
  const res = await asAdmin.get('/accounting/account-mappings');
  expect(res.status(), 'firstAccountingAccountMapping: GET /accounting/account-mappings').toBe(200);
  const rows = (await res.json()) as Array<{ id: number }>;
  const picked = rows[0];
  if (!picked) {
    throw new Error(
      'firstAccountingAccountMapping: no account-mapping rows on this tenant — ' +
        'tag test @requires:data-accounting-account-mapping. Seed account ' +
        'mappings by running POST /accounting/setup/initial-sync with real QB ' +
        'credentials OR flip TESTS_DATA_CAPABILITIES=accounting-account-mapping ' +
        'after verifying GET /accounting/account-mappings returns a non-empty list.',
    );
  }
  return { id: picked.id };
}

// ── Load board (Phase 5 Group 5f) ────────────────────────────────────

/**
 * Run a broad POST /load-board/search against the DAT adapter and
 * return the first listing's `externalId`. On dev the adapter is in
 * `MOCK_MODE=all` — it returns MOCK_LISTINGS filtered by origin
 * (dat-mock-data.ts + dat-load-board.adapter.ts::mockSearch).
 *
 * Throws with a `@requires:data-load-board-listing` error message when
 * the adapter returns zero listings — guards against envs where
 * MOCK_MODE is off AND no DAT credentials are wired (status would 404
 * on the underlying fetch). Caller MUST carry the tag.
 */
export async function firstLoadBoardListingId(asDispatcher: RoleApiClient): Promise<string> {
  const res = await asDispatcher.post('/load-board/search', buildLoadBoardSearch());
  expect(res.status(), 'firstLoadBoardListingId: POST /load-board/search').toBe(201);
  const body = (await res.json()) as { listings?: Array<{ externalId?: string }> };
  const picked = body?.listings?.[0];
  if (!picked || typeof picked.externalId !== 'string') {
    throw new Error(
      'firstLoadBoardListingId: POST /load-board/search returned no listings — ' +
        'tag test @requires:data-load-board-listing. The DAT adapter is expected ' +
        'to return mocked listings when MOCK_MODE=all (dev default); if the env ' +
        'has real DAT credentials but no live matches, flip ' +
        'TESTS_DATA_CAPABILITIES=load-board-listing only after verifying a ' +
        'non-empty `listings[]` on a broad search.',
    );
  }
  return picked.externalId;
}

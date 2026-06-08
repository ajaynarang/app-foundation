/**
 * Integrations · Email Intake (Phase 5 Group 5e — 7 tests on EmailIntakeController).
 *
 * Covers the 7 endpoints on
 * `apps/backend/src/domains/integrations/email-intake/controllers/email-intake.controller.ts`:
 *
 *   51. GET  /integrations/email-intake/threads                      — list threads
 *   52. GET  /integrations/email-intake/threads/:id                  — thread detail
 *   53. POST /integrations/email-intake/threads/:id/confirm          — confirm → create load
 *   54. POST /integrations/email-intake/threads/:id/discard          — discard thread
 *   55. POST /integrations/email-intake/threads/:id/restore          — restore discarded
 *   56. POST /integrations/email-intake/threads/:id/approve-sender   — approve sender
 *   57. POST /integrations/email-intake/attachments/:id/reparse      — requeue parse
 *
 * Class-level `@RequireFeature('email_intake')` on the controller — every
 * test is tagged `@requires:plan-email_intake`. No explicit `@Roles(...)`
 * decorator on the controller or any handler — the class-level JWT guard
 * accepts any authenticated user with the feature enabled. We use
 * `asAdmin` for consistency with the rest of Phase 5.
 *
 * Status codes (verified against controller source — no `@HttpCode`
 * overrides on any handler):
 *   - GET 51, 52:       200 (Nest GET default)
 *   - POST 53, 54, 55, 56, 57: 201 (Nest POST default)
 *
 * Data capabilities (detect-capabilities.ts additions — Phase 5 Group 5e):
 *   - `email-intake-thread`     → tests 52, 53, 54, 55, 56
 *   - `email-intake-attachment` → test 57
 * On a default dev run these are absent → 6 of 7 tests are collection-
 * excluded. Test 51 is the only reliably-green case because it lists
 * (possibly empty) threads on any tenant with the feature enabled.
 *
 * Bootstrap (helpers):
 *   - `firstEmailIntakeThread(asAdmin)` — picks data[0].id; throws with
 *     a `@requires:data-email-intake-thread` message if the list is empty.
 *   - `firstEmailIntakeAttachment(asAdmin)` — scans the thread graph for
 *     the first attachment id; throws with a
 *     `@requires:data-email-intake-attachment` message if none exists.
 *
 * Rubric (per tests/README.md):
 *   - Role fixture: `asAdmin`.
 *   - Factories: buildConfirmEmailLoad (test 53 only).
 *   - Exact numeric status on every test.
 *   - expectContract(Schema.strict(), body) on every happy path.
 *   - Semantic assertion on every test (echo / state flip / count).
 *   - Cleanup: tests 54 + 55 form a natural pair (discard then restore) —
 *     by the end of test 55 the thread is back in PENDING. Test 53 is
 *     destructive (creates a real Load row) — gated on data capability
 *     so it only runs when the operator has seeded a parseable thread
 *     and accepted the load-creation side-effect.
 *   - Tags: `@workflow @contract @requires:plan-email_intake` baseline;
 *     `@destructive` on tests that persist state (53, 54, 55, 56, 57).
 *   - Zero runtime `test.skip`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildConfirmEmailLoad } from '@sally/test-utils/factories';
import { expectContract, IntegrationSchemas } from '@sally/test-utils/schemas';
import { firstEmailIntakeThread, firstEmailIntakeAttachment } from './_helpers';

const {
  EmailThreadListSchema,
  EmailThreadDetailSchema,
  EmailThreadConfirmResponseSchema,
  EmailThreadDiscardResponseSchema,
  EmailThreadRestoreResponseSchema,
  EmailThreadApproveSenderResponseSchema,
  EmailIntakeReparseResponseSchema,
} = IntegrationSchemas;

test.describe('Integrations · Email Intake @workflow @contract @requires:plan-email_intake', () => {
  // 51 ── GET /integrations/email-intake/threads ───────────────────────
  test('GET /integrations/email-intake/threads returns the paged envelope (ADMIN) @workflow @contract @requires:plan-email_intake', async ({
    asAdmin,
  }) => {
    const res = await asAdmin.get('/integrations/email-intake/threads');
    expect(res.status()).toBe(200);
    const body = expectContract(
      EmailThreadListSchema,
      await res.json(),
      'GET /integrations/email-intake/threads',
    );

    // Semantic — paged envelope defaults are page=1, limit=20 (service
    // ::listThreads lines 341–342). `data[]` is sized ≤ limit, `totalPages`
    // is consistent with total/limit. This test tolerates an EMPTY tenant
    // (demo-northstar ships zero threads) — the envelope shape is the
    // assertion, not row content.
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
    expect(body.data.length).toBeLessThanOrEqual(body.limit);
    expect(body.total).toBeGreaterThanOrEqual(body.data.length);
    if (body.total === 0) {
      expect(body.totalPages).toBe(0);
    } else {
      expect(body.totalPages).toBe(Math.ceil(body.total / body.limit));
    }
  });

  // 52 ── GET /integrations/email-intake/threads/:id ───────────────────
  test('GET /integrations/email-intake/threads/:id returns the thread detail (ADMIN) @workflow @contract @requires:plan-email_intake @requires:data-email-intake-thread', async ({
    asAdmin,
  }) => {
    const { threadId } = await firstEmailIntakeThread(asAdmin);
    const res = await asAdmin.get(`/integrations/email-intake/threads/${threadId}`);
    expect(res.status()).toBe(200);
    const body = expectContract(
      EmailThreadDetailSchema,
      await res.json(),
      `GET /integrations/email-intake/threads/${threadId}`,
    );

    // Semantic — detail `id` matches the requested threadId; the row
    // carries the full message + attachment graph (Prisma include).
    expect(body.id).toBe(threadId);
    expect(body.senderEmail.length).toBeGreaterThan(0);
    expect(Array.isArray(body.messages)).toBe(true);
  });

  // 53 ── POST /integrations/email-intake/threads/:id/confirm ──────────
  test('POST /integrations/email-intake/threads/:id/confirm creates a load (ADMIN) @workflow @contract @destructive @requires:plan-email_intake @requires:data-email-intake-thread', async ({
    asAdmin,
  }) => {
    const { threadId } = await firstEmailIntakeThread(asAdmin);

    // Find a parsed attachment id on this thread to pass via the DTO.
    // The service accepts an optional `attachmentId`; when omitted it
    // falls back to the latest PARSED attachment. We supply one
    // explicitly when present so the test is deterministic across
    // multiple PARSED attachments.
    const detailRes = await asAdmin.get(`/integrations/email-intake/threads/${threadId}`);
    expect(detailRes.status()).toBe(200);
    const detail = (await detailRes.json()) as {
      messages?: Array<{ attachments?: Array<{ id?: string; parseStatus?: string }> }>;
    };
    const parsedAttachmentId = (detail.messages ?? [])
      .flatMap((m) => m.attachments ?? [])
      .find((a) => a.parseStatus === 'PARSED' && typeof a.id === 'string')?.id;

    const payload = buildConfirmEmailLoad(
      parsedAttachmentId ? { attachmentId: parsedAttachmentId } : {},
    );
    const res = await asAdmin.post(
      `/integrations/email-intake/threads/${threadId}/confirm`,
      payload,
    );
    // Nest POST default — no `@HttpCode` override on the handler.
    expect(res.status()).toBe(201);
    const body = expectContract(
      EmailThreadConfirmResponseSchema,
      await res.json(),
      `POST /integrations/email-intake/threads/${threadId}/confirm`,
    );

    // Semantic — a brand-new Load was created and linked to the thread.
    // `loadId` is the string identifier (cuid-prefixed); `loadNumber` is
    // human-readable (e.g. "LD-2026-0001").
    expect(body.loadId.length).toBeGreaterThan(0);
    expect(body.loadNumber.length).toBeGreaterThan(0);

    // Persistence — the thread's status flips to CONFIRMED on a
    // follow-up GET (service ::confirmThread writes {status: 'CONFIRMED',
    // confirmedAt, confirmedById}).
    const verifyRes = await asAdmin.get(`/integrations/email-intake/threads/${threadId}`);
    expect(verifyRes.status()).toBe(200);
    const verify = (await verifyRes.json()) as { status: string; confirmedLoadId: string | null };
    expect(verify.status).toBe('CONFIRMED');
    expect(verify.confirmedLoadId).toBe(body.loadId);
  });

  // 54 ── POST /integrations/email-intake/threads/:id/discard ──────────
  test('POST /integrations/email-intake/threads/:id/discard flips the thread to DISCARDED (ADMIN) @workflow @contract @destructive @requires:plan-email_intake @requires:data-email-intake-thread', async ({
    asAdmin,
  }) => {
    const { threadId } = await firstEmailIntakeThread(asAdmin);
    const res = await asAdmin.post(`/integrations/email-intake/threads/${threadId}/discard`, {});
    expect(res.status()).toBe(201);
    const body = expectContract(
      EmailThreadDiscardResponseSchema,
      await res.json(),
      `POST /integrations/email-intake/threads/${threadId}/discard`,
    );

    // Semantic — controller returns `{status: 'discarded'}` (literal).
    expect(body.status).toBe('discarded');

    // Persistence — the thread's status flips to DISCARDED on follow-up GET.
    const verifyRes = await asAdmin.get(`/integrations/email-intake/threads/${threadId}`);
    expect(verifyRes.status()).toBe(200);
    const verify = (await verifyRes.json()) as { status: string };
    expect(verify.status).toBe('DISCARDED');
  });

  // 55 ── POST /integrations/email-intake/threads/:id/restore ──────────
  test('POST /integrations/email-intake/threads/:id/restore flips a DISCARDED thread back to PENDING (ADMIN) @workflow @contract @destructive @requires:plan-email_intake @requires:data-email-intake-thread', async ({
    asAdmin,
  }) => {
    const { threadId } = await firstEmailIntakeThread(asAdmin);

    // Restore ONLY works on DISCARDED threads (service ::restoreThread
    // line 457 — `where: { status: 'DISCARDED' }`). If the seeded
    // thread is not DISCARDED, discard it first so this test is
    // deterministic regardless of cross-test ordering. The discard is
    // itself idempotent (no-op if already DISCARDED).
    const preRes = await asAdmin.get(`/integrations/email-intake/threads/${threadId}`);
    expect(preRes.status()).toBe(200);
    const pre = (await preRes.json()) as { status: string };
    if (pre.status !== 'DISCARDED') {
      const discardRes = await asAdmin.post(
        `/integrations/email-intake/threads/${threadId}/discard`,
        {},
      );
      expect(discardRes.status()).toBe(201);
    }

    const res = await asAdmin.post(`/integrations/email-intake/threads/${threadId}/restore`, {});
    expect(res.status()).toBe(201);
    const body = expectContract(
      EmailThreadRestoreResponseSchema,
      await res.json(),
      `POST /integrations/email-intake/threads/${threadId}/restore`,
    );

    // Semantic — controller returns `{status: 'restored'}` (literal).
    expect(body.status).toBe('restored');

    // Persistence — service ::restoreThread writes `{status: 'PENDING'}`,
    // so a follow-up GET shows PENDING.
    const verifyRes = await asAdmin.get(`/integrations/email-intake/threads/${threadId}`);
    expect(verifyRes.status()).toBe(200);
    const verify = (await verifyRes.json()) as { status: string };
    expect(verify.status).toBe('PENDING');
  });

  // 56 ── POST /integrations/email-intake/threads/:id/approve-sender ───
  test('POST /integrations/email-intake/threads/:id/approve-sender approves domain + requeues held attachments (ADMIN) @workflow @contract @destructive @requires:plan-email_intake @requires:data-email-intake-thread', async ({
    asAdmin,
  }) => {
    const { threadId } = await firstEmailIntakeThread(asAdmin);
    const res = await asAdmin.post(
      `/integrations/email-intake/threads/${threadId}/approve-sender`,
      {},
    );
    expect(res.status()).toBe(201);
    const body = expectContract(
      EmailThreadApproveSenderResponseSchema,
      await res.json(),
      `POST /integrations/email-intake/threads/${threadId}/approve-sender`,
    );

    // Semantic — service returns `{status: 'approved', domain?, requeuedCount}`.
    // `domain` is undefined only when sender email has no @ segment
    // (malformed data); `requeuedCount` is zero when no SENDER_UNKNOWN
    // attachments exist on the thread — both branches are valid.
    expect(body.status).toBe('approved');
    expect(body.requeuedCount).toBeGreaterThanOrEqual(0);
    if (body.domain !== undefined) {
      expect(body.domain.length).toBeGreaterThan(0);
      // Persistence — sender domain is now in the tenant's approvedDomains
      // list (service ::approveSenderAndParse lines 498–504).
      const settingsRes = await asAdmin.get('/integrations/email-intake/settings');
      expect(settingsRes.status()).toBe(200);
      const settings = (await settingsRes.json()) as { approvedDomains: string[] };
      expect(settings.approvedDomains).toContain(body.domain);
    }
  });

  // 57 ── POST /integrations/email-intake/attachments/:id/reparse ──────
  test('POST /integrations/email-intake/attachments/:id/reparse requeues the attachment (ADMIN) @workflow @contract @destructive @requires:plan-email_intake @requires:data-email-intake-attachment', async ({
    asAdmin,
  }) => {
    const { attachmentId } = await firstEmailIntakeAttachment(asAdmin);
    const res = await asAdmin.post(
      `/integrations/email-intake/attachments/${attachmentId}/reparse`,
      {},
    );
    expect(res.status()).toBe(201);
    const body = expectContract(
      EmailIntakeReparseResponseSchema,
      await res.json(),
      `POST /integrations/email-intake/attachments/${attachmentId}/reparse`,
    );

    // Semantic — service ::requeueAttachment line 641 returns
    // `{requeued: true}` after resetting parseStatus + re-adding to queue.
    expect(body.requeued).toBe(true);
  });
});

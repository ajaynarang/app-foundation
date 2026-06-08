/**
 * Operations — In-App Notifications (Phase 3 Group 3a).
 *
 * Covers all 7 endpoints on `NotificationsController`:
 *
 *   1. GET  /notifications                           list (pure read)
 *   2. GET  /notifications/count                     unread-count breakdown
 *   3. POST /notifications/:notification_id/read
 *   4. POST /notifications/:notification_id/dismiss
 *   5. POST /notifications/:notification_id/unread
 *   6. POST /notifications/mark-all-read             body `{ category? }`
 *   7. POST /notifications/dismiss-all-read
 *
 * Class-level `@Roles(DRIVER, DISPATCHER, ADMIN, OWNER)`. We run the whole
 * file as `asDispatcher` to stay consistent with the rest of the operations
 * suite — any of the four roles would work.
 *
 * Data bootstrap: there is no public POST /notifications — in-app rows are
 * emitted by system events (invoice generated, driver activated, etc.). Tests
 * 3–7 call `seedNotification(asDispatcher)`; when the dispatcher user has no
 * UNREAD rows the helper throws and the test is excluded at collection time
 * via `@requires:data-in-app-notification`. Tests 1 + 2 are pure reads that
 * tolerate an empty list (the envelope is still valid), so they carry no
 * data-gate.
 *
 * Schema drift note: the re-exported `NotificationSchema` /
 * `NotificationCountSchema` from `@sally/test-utils/schemas/operations` were
 * authored before this rewrite and don't match the live shape (the count
 * endpoint returns a 4-key breakdown, not `{ unread }`; and the notification
 * row carries many more fields than the schema lists). We hot-fix both here
 * with strict shapes reverse-engineered from `notifications.service.ts` and
 * `schema.prisma::Notification`. Drift captured in finding #27.
 *
 * Cleanup: tests 3 (read) / 5 (unread) restore the notification's original
 * state in afterEach. Test 4 (dismiss) and test 7 (dismiss-all-read) leave
 * the notification dismissed — `@destructive` + tenant-pollution note in the
 * file header: notifications are per-user + ephemeral, so a residual dismiss
 * does not interfere with other tests. Test 6 (mark-all-read) is
 * reverse-cleaned by marking the seed notification unread if it was unread
 * before the test.
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract } from '@sally/test-utils/schemas';
import { z } from 'zod';
import { seedNotification } from './_helpers.js';

// ── Hot-fixed schemas (TODO(phase-3-verify) finding #27) ────────────────────
//
// Matches the Prisma `Notification` row returned by `listForUser`. All
// timestamp-ish fields hit the wire as ISO strings. `category` is the
// `NotificationCategory` enum (SYSTEM/TEAM/BILLING). `channel` is always
// `IN_APP` for this endpoint. `status` is the `NotificationStatus` enum.
const NotificationRowSchema = z
  .object({
    id: z.number().int(),
    notificationId: z.string(),
    type: z.string(),
    channel: z.string(),
    recipient: z.string(),
    status: z.string(),
    tenantId: z.number().int().nullable(),
    userId: z.number().int().nullable(),
    invitationId: z.number().int().nullable(),
    category: z.string(),
    title: z.string().nullable(),
    message: z.string().nullable(),
    actionUrl: z.string().nullable(),
    actionLabel: z.string().nullable(),
    iconType: z.string().nullable(),
    readAt: z.string().nullable(),
    dismissedAt: z.string().nullable(),
    groupKey: z.string().nullable(),
    groupCount: z.number().int(),
    emailJobId: z.string().nullable(),
    smsJobId: z.string().nullable(),
    metadata: z.unknown().nullable(),
    errorMessage: z.string().nullable(),
    sentAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

/** `GET /notifications` envelope. */
const NotificationListResponseSchema = z
  .object({
    data: z.array(NotificationRowSchema),
    total: z.number().int(),
  })
  .strict();

/**
 * `GET /notifications/count`. Reverse-engineered from
 * `InAppNotificationService.getUnreadCount` — a 4-key breakdown keyed to
 * the lowercased `NotificationCategory` enum members. Shared-types
 * `NotificationCountSchema` exposes `{ unread }`, which is stale.
 */
const NotificationCountResponseSchema = z
  .object({
    total: z.number().int(),
    system: z.number().int(),
    team: z.number().int(),
    billing: z.number().int(),
  })
  .strict();

/**
 * Prisma `updateMany` passthrough — `{ count }` — returned for mark-read /
 * dismiss / unread on a single notification.
 */
const UpdateManyResultSchema = z.object({ count: z.number().int() }).strict();

/** Bulk ops return `{ updated }` (controller wraps the Prisma count). */
const BulkUpdateResponseSchema = z.object({ updated: z.number().int() }).strict();

type NotificationRow = z.infer<typeof NotificationRowSchema>;

async function fetchNotificationById(
  asDispatcher: import('@sally/test-utils/playwright').RoleApiClient,
  notificationId: string,
): Promise<NotificationRow | undefined> {
  // List is paginated + filtered on dismissedAt=null; walk a reasonable page
  // depth to find the row. Seeded data plus heavy demo tenants can push the
  // row past page 1 — `limit=100` comfortably covers demo-northstar today.
  const res = await asDispatcher.get('/notifications?limit=100');
  expect(res.status()).toBe(200);
  const body = expectContract(NotificationListResponseSchema, await res.json());
  return body.data.find((row) => row.notificationId === notificationId);
}

test.describe('Operations · Notifications @workflow', () => {
  // 1 ── GET /notifications ─────────────────────────────────────────────────
  test('GET /notifications returns a paginated envelope with contract-valid rows @workflow', async ({
    asDispatcher,
  }) => {
    // Pure read — the envelope MUST be valid even when the list is empty.
    const res = await asDispatcher.get('/notifications?limit=5');
    expect(res.status()).toBe(200);
    const body = expectContract(NotificationListResponseSchema, await res.json(), 'GET /notifications');

    // Semantic — pagination arithmetic is coherent.
    expect(body.total).toBeGreaterThanOrEqual(body.data.length);
    // Controller only ever surfaces IN_APP rows (service hardcodes channel).
    for (const row of body.data) {
      expect(row.channel).toBe('IN_APP');
    }

    // Persistence / idempotency — a second read returns the same envelope
    // within a tiny window (no count drift).
    const secondRes = await asDispatcher.get('/notifications?limit=5');
    expect(secondRes.status()).toBe(200);
    const second = expectContract(NotificationListResponseSchema, await secondRes.json());
    expect(second.total).toBe(body.total);

    // No afterEach needed — pure read, no mutation, no created rows.
  });

  // 2 ── GET /notifications/count ───────────────────────────────────────────
  test('GET /notifications/count returns a non-negative category breakdown @workflow', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/notifications/count');
    expect(res.status()).toBe(200);
    const body = expectContract(NotificationCountResponseSchema, await res.json(), 'GET /notifications/count');

    // Semantic — counts are non-negative integers; total is the sum of (or
    // at minimum greater-or-equal to) the three enum buckets (SYSTEM/TEAM/
    // BILLING). Future enum members would break the tight equality, so we
    // assert the weaker lower-bound which is always true by construction of
    // `getUnreadCount`.
    expect(body.total).toBeGreaterThanOrEqual(0);
    expect(body.system).toBeGreaterThanOrEqual(0);
    expect(body.team).toBeGreaterThanOrEqual(0);
    expect(body.billing).toBeGreaterThanOrEqual(0);
    expect(body.total).toBeGreaterThanOrEqual(body.system + body.team + body.billing);

    // No afterEach needed — pure read.
  });

  // ── Single-row mutations (tests 3–5) ─────────────────────────────────────
  //
  // Each of these seeds an UNREAD notification, flips it, then restores (or
  // in the case of dismiss, leaves it dismissed — documented below).
  test.describe('single-row mutations @requires:data-in-app-notification', () => {
    // 3 ── POST /notifications/:id/read ────────────────────────────────────
    test('POST /notifications/:id/read transitions readAt from null to a timestamp @workflow @destructive', async ({
      asDispatcher,
    }) => {
      const seed = await seedNotification(asDispatcher);

      const res = await asDispatcher.post(`/notifications/${seed.notificationId}/read`, {});
      expect(res.status()).toBe(201);
      const result = expectContract(UpdateManyResultSchema, await res.json(), 'POST /notifications/:id/read');
      // Semantic — prisma `updateMany` matched exactly one row.
      expect(result.count).toBe(1);

      // Persistence — GET the list back, verify readAt is now non-null.
      const row = await fetchNotificationById(asDispatcher, seed.notificationId);
      expect(row, 'just-marked-read notification must appear in the list').toBeDefined();
      expect(row?.readAt).not.toBeNull();
      expect(row?.dismissedAt).toBeNull();

      // Cleanup — restore to UNREAD so the row is available to later seed
      // calls. POST /unread returns `{ count }` and is idempotent.
      const restoreRes = await asDispatcher.post(`/notifications/${seed.notificationId}/unread`, {});
      expect([200, 201]).toContain(restoreRes.status());
    });

    // 4 ── POST /notifications/:id/dismiss ─────────────────────────────────
    test('POST /notifications/:id/dismiss hides the row from the default list @workflow @destructive', async ({
      asDispatcher,
    }) => {
      const seed = await seedNotification(asDispatcher);

      const res = await asDispatcher.post(`/notifications/${seed.notificationId}/dismiss`, {});
      expect(res.status()).toBe(201);
      const result = expectContract(UpdateManyResultSchema, await res.json(), 'POST /notifications/:id/dismiss');
      expect(result.count).toBe(1);

      // Persistence — dismissed rows are filtered out of `listForUser`
      // (service hardcodes `dismissedAt: null`). The row must NOT appear.
      const row = await fetchNotificationById(asDispatcher, seed.notificationId);
      expect(row, 'dismissed notification must disappear from default list').toBeUndefined();

      // Cleanup note — there is no public `POST /notifications/:id/undismiss`.
      // The dismissed row stays terminal; acceptable because notifications
      // are per-user + ephemeral and the unread pool at the user level is
      // regenerated by system events. `@destructive` tag documents the
      // one-way transition.
    });

    // 5 ── POST /notifications/:id/unread ──────────────────────────────────
    test('POST /notifications/:id/unread flips a read notification back to unread @workflow @destructive', async ({
      asDispatcher,
    }) => {
      const seed = await seedNotification(asDispatcher);

      // Arrange — mark read first, so /unread has a read→unread transition
      // to exercise.
      const readRes = await asDispatcher.post(`/notifications/${seed.notificationId}/read`, {});
      expect(readRes.status()).toBe(201);

      const res = await asDispatcher.post(`/notifications/${seed.notificationId}/unread`, {});
      expect(res.status()).toBe(201);
      const result = expectContract(UpdateManyResultSchema, await res.json(), 'POST /notifications/:id/unread');
      expect(result.count).toBe(1);

      // Persistence — readAt is null again.
      const row = await fetchNotificationById(asDispatcher, seed.notificationId);
      expect(row).toBeDefined();
      expect(row?.readAt).toBeNull();
      expect(row?.dismissedAt).toBeNull();

      // Cleanup — original state is UNREAD (per seedNotification's query),
      // and we've restored to UNREAD. No further action needed.
    });
  });

  // ── Bulk operations (tests 6–7) ──────────────────────────────────────────
  //
  // Each uses its own seeded notification. Bulk-mark-read is non-destructive
  // modulo per-user pollution and is covered by a dismiss cleanup. Bulk
  // dismiss-all-read terminates on dismissed state — documented as accepted
  // pollution (see file header).
  test.describe('bulk operations @requires:data-in-app-notification', () => {
    // 6 ── POST /notifications/mark-all-read ───────────────────────────────
    test('POST /notifications/mark-all-read drops the unread count to zero @workflow @destructive', async ({
      asDispatcher,
    }) => {
      // Establish precondition — at least one unread notification exists.
      const seed = await seedNotification(asDispatcher);

      // Pre — there is an unread row we just picked.
      const pre = await asDispatcher.get('/notifications/count');
      expect(pre.status()).toBe(200);
      const preBody = expectContract(NotificationCountResponseSchema, await pre.json());
      expect(preBody.total).toBeGreaterThan(0);

      // Act — bulk mark-all-read with no category filter.
      const res = await asDispatcher.post('/notifications/mark-all-read', {});
      expect(res.status()).toBe(201);
      const result = expectContract(BulkUpdateResponseSchema, await res.json(), 'POST /notifications/mark-all-read');
      // Semantic — the bulk count is at least the pre-unread total (may be
      // higher if concurrent notifications arrived — safe lower bound).
      expect(result.updated).toBeGreaterThanOrEqual(1);

      // Persistence — count is now zero.
      const post = await asDispatcher.get('/notifications/count');
      expect(post.status()).toBe(200);
      const postBody = expectContract(NotificationCountResponseSchema, await post.json());
      expect(postBody.total).toBe(0);

      // The seeded row itself now has readAt != null.
      const row = await fetchNotificationById(asDispatcher, seed.notificationId);
      expect(row).toBeDefined();
      expect(row?.readAt).not.toBeNull();

      // Cleanup — restore the seed row to UNREAD so later runs can pick it
      // again. Other rows stay read, which is benign (new system events
      // will keep generating unreads).
      const restoreRes = await asDispatcher.post(`/notifications/${seed.notificationId}/unread`, {});
      expect([200, 201]).toContain(restoreRes.status());
    });

    // 7 ── POST /notifications/dismiss-all-read ────────────────────────────
    test('POST /notifications/dismiss-all-read removes all read rows from the default list @workflow @destructive', async ({
      asDispatcher,
    }) => {
      const seed = await seedNotification(asDispatcher);

      // Arrange — mark the seed read so dismiss-all-read will target it.
      const readRes = await asDispatcher.post(`/notifications/${seed.notificationId}/read`, {});
      expect(readRes.status()).toBe(201);

      // Act — bulk dismiss all read.
      const res = await asDispatcher.post('/notifications/dismiss-all-read', {});
      expect(res.status()).toBe(201);
      const result = expectContract(BulkUpdateResponseSchema, await res.json(), 'POST /notifications/dismiss-all-read');
      expect(result.updated).toBeGreaterThanOrEqual(1);

      // Persistence — the freshly-read row is now dismissed and therefore
      // excluded from the default list.
      const row = await fetchNotificationById(asDispatcher, seed.notificationId);
      expect(row, 'read row must disappear after dismiss-all-read').toBeUndefined();

      // Cleanup note — dismiss is terminal via the public API. Accepted
      // pollution (per-user + ephemeral; see file header). Tag: @destructive.
    });
  });
});

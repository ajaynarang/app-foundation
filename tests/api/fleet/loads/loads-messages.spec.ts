/**
 * Fleet — Load Messages API (Phase 1 Group 7b)
 *
 * Covers every endpoint on `LoadMessagesController`:
 *
 *   - GET   /loads/:load_id/messages               → list conversation
 *   - GET   /loads/:load_id/messages/unread-count  → count for current role
 *   - POST  /loads/:load_id/messages               → send (throttled 30/min)
 *   - PATCH /loads/:load_id/messages/read          → mark conversation read
 *   - POST  /loads/:load_id/messages/:message_id/delivered → DRIVER-only ack
 *
 * Role rules:
 *   - GET / POST / PATCH / unread-count → DRIVER, DISPATCHER, ADMIN, OWNER.
 *     Dispatcher is the canonical back-office path; tests exercise it via
 *     `asDispatcher`.
 *   - POST /delivered → DRIVER only, additionally guarded by
 *     `validateLoadAccess` which requires `load.driverId === user.driverDbId`.
 *     The only way for the `asDriver` fixture to line that up is to assign
 *     the load to the Driver row linked to the DRIVER user's JWT —
 *     resolved via `seededDriverPublicId(authState)`.
 *
 * Controller projection (inline in
 * `apps/backend/src/domains/fleet/loads/controllers/load-messages.controller.ts`):
 *   Listing (`getMessages`): `{ id, role, content, senderId: m.inputMode, createdAt }`
 *   Sending (`sendMessage`): `{ id, role, content, senderId: user.userId, createdAt }`
 *   Both emit strings for `senderId` — `LoadMessageSchema` captures that.
 *
 * Throttle accounting: this entire spec fires `POST /messages` at most
 * twice per test (setup for the delivered test + any branch that sends a
 * message). Total across 5 tests ≤ 10, well under the 30/min limit
 * declared on the controller via `@Throttle({ default: { ttl: 60000, limit: 30 }})`.
 *
 * Schema strategy: hand-written `LoadMessageSchema` / `UnreadCountResponseSchema`
 * / `MarkMessageReadResponseSchema` / `MarkMessageDeliveredResponseSchema`
 * in `packages/test-utils/src/schemas/load-subresources.ts`. Shared-types
 * carries a drifted `role` enum, so we stay local.
 */
import { test, expect } from '@sally/test-utils/auth';
import { buildLoadMessage } from '@sally/test-utils/factories';
import { expectArrayContract, expectContract, LoadSubresourceSchemas } from '@sally/test-utils/schemas';
import { cleanupLoad } from '@sally/test-utils/helpers';
import { createAssignedLoad, seededDriverPublicId } from './_helpers.js';

const {
  LoadMessageSchema,
  UnreadCountResponseSchema,
  MarkMessageReadResponseSchema,
  MarkMessageDeliveredResponseSchema,
} = LoadSubresourceSchemas;

test.describe('Fleet · Load Messages @workflow', () => {
  const createdLoadIds: string[] = [];
  const createdDriverIds: string[] = [];

  test.afterEach(async ({ asDispatcher, asAdmin }) => {
    for (const loadId of createdLoadIds.splice(0)) {
      await cleanupLoad(asDispatcher, loadId).catch(() => undefined);
    }
    for (const driverId of createdDriverIds.splice(0)) {
      await asAdmin.post(`/drivers/${driverId}/deactivate`, { reason: 'test cleanup' }).catch(() => undefined);
    }
  });

  // 1 ── GET /loads/:load_id/messages ─────────────────────────────────
  test('GET /loads/:load_id/messages returns the conversation list, empty before any send @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createAssignedLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    if (setup.createdDriver) createdDriverIds.push(setup.driverPublicId);

    // ── Before any send: controller returns [] (no conversation row yet).
    const emptyRes = await asDispatcher.get(`/loads/${setup.loadId}/messages`);
    expect(emptyRes.status()).toBe(200);
    const empty = (await emptyRes.json()) as unknown;
    expect(Array.isArray(empty)).toBe(true);
    expect((empty as unknown[]).length).toBe(0);

    // ── After one send: the list has the send we just posted.
    const sendPayload = buildLoadMessage({ content: 'QA list-populates check' });
    const sendRes = await asDispatcher.post(`/loads/${setup.loadId}/messages`, sendPayload);
    expect(sendRes.status()).toBe(201);
    const sent = expectContract(LoadMessageSchema.strict(), await sendRes.json(), 'POST /loads/:id/messages');

    const listRes = await asDispatcher.get(`/loads/${setup.loadId}/messages`);
    expect(listRes.status()).toBe(200);
    const list = expectArrayContract(LoadMessageSchema.strict(), await listRes.json(), {
      context: 'GET /loads/:id/messages',
    });
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(sent.id);
    expect(list[0].content).toBe(sendPayload.content);
    expect(list[0].role).toBe('dispatcher');
  });

  // 2 ── GET /loads/:load_id/messages/unread-count ────────────────────
  test('GET /loads/:load_id/messages/unread-count returns zero when no counterpart messages exist @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createAssignedLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    if (setup.createdDriver) createdDriverIds.push(setup.driverPublicId);

    // No conversation exists yet → controller short-circuits to { count: 0 }.
    const preRes = await asDispatcher.get(`/loads/${setup.loadId}/messages/unread-count`);
    expect(preRes.status()).toBe(200);
    const pre = expectContract(
      UnreadCountResponseSchema.strict(),
      await preRes.json(),
      'GET /loads/:id/messages/unread-count (pre)',
    );
    expect(pre.count).toBe(0);

    // Dispatcher sends a message → increments the 'other-role' counter for
    // drivers, but the dispatcher's own unread count stays at 0 (the
    // service counts messages whose `role !== current user's role`).
    const sendRes = await asDispatcher.post(
      `/loads/${setup.loadId}/messages`,
      buildLoadMessage({ content: 'QA unread-count self-send' }),
    );
    expect(sendRes.status()).toBe(201);

    const postRes = await asDispatcher.get(`/loads/${setup.loadId}/messages/unread-count`);
    expect(postRes.status()).toBe(200);
    const post = expectContract(
      UnreadCountResponseSchema.strict(),
      await postRes.json(),
      'GET /loads/:id/messages/unread-count (post)',
    );
    // Dispatcher's unread count excludes dispatcher-sent messages.
    expect(post.count).toBe(0);
  });

  // 3 ── POST /loads/:load_id/messages ────────────────────────────────
  test('POST /loads/:load_id/messages persists with role=dispatcher and the submitted content @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createAssignedLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    if (setup.createdDriver) createdDriverIds.push(setup.driverPublicId);

    const payload = buildLoadMessage({
      content: 'QA send — dispatcher-authored',
    });
    const res = await asDispatcher.post(`/loads/${setup.loadId}/messages`, payload);
    expect(res.status()).toBe(201);
    const body = expectContract(LoadMessageSchema.strict(), await res.json(), 'POST /loads/:id/messages');

    // Semantic: controller sets role from the actor's session role; sender
    // id is the user's public string id (see `sendMessage` tail — the
    // returned `senderId: user.userId`).
    expect(body.role).toBe('dispatcher');
    expect(body.content).toBe(payload.content);
    expect(body.id.startsWith('msg-')).toBe(true);
    expect(body.senderId.length).toBeGreaterThan(0);

    // Persistence via GET — message appears with the same id and content.
    const listRes = await asDispatcher.get(`/loads/${setup.loadId}/messages`);
    expect(listRes.status()).toBe(200);
    const list = expectArrayContract(LoadMessageSchema.strict(), await listRes.json(), {
      context: 'GET /loads/:id/messages (after send)',
    });
    const seen = list.find((m) => m.id === body.id);
    expect(seen).toBeDefined();
    expect(seen?.content).toBe(payload.content);
  });

  // 4 ── PATCH /loads/:load_id/messages/read ──────────────────────────
  test('PATCH /loads/:load_id/messages/read marks the dispatcher-side as read and zeroes unread count @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
  }) => {
    const setup = await createAssignedLoad(asDispatcher, asAdmin);
    createdLoadIds.push(setup.loadId);
    if (setup.createdDriver) createdDriverIds.push(setup.driverPublicId);

    // Seed one dispatcher-sent message so the conversation row exists.
    // (PATCH /read uses `updateMany`, so it's safe without a conversation,
    // but we still want an observable unread-count transition.)
    const sendRes = await asDispatcher.post(
      `/loads/${setup.loadId}/messages`,
      buildLoadMessage({ content: 'QA seed for mark-read' }),
    );
    expect(sendRes.status()).toBe(201);

    const res = await asDispatcher.patch(`/loads/${setup.loadId}/messages/read`, {});
    expect(res.status()).toBe(200);
    const body = expectContract(
      MarkMessageReadResponseSchema.strict(),
      await res.json(),
      'PATCH /loads/:id/messages/read',
    );
    expect(body.success).toBe(true);

    // Persistence — subsequent unread-count read reflects the dispatcher
    // read-cursor moving past the dispatcher's own message (no counterpart
    // messages exist yet, so count is still 0).
    const countRes = await asDispatcher.get(`/loads/${setup.loadId}/messages/unread-count`);
    expect(countRes.status()).toBe(200);
    const count = expectContract(UnreadCountResponseSchema.strict(), await countRes.json());
    expect(count.count).toBe(0);
  });

  // 5 ── POST /loads/:load_id/messages/:message_id/delivered ──────────
  test('POST /loads/:load_id/messages/:message_id/delivered acks a dispatcher message from the driver @workflow @destructive', async ({
    asDispatcher,
    asAdmin,
    asDriver,
    authState,
  }) => {
    // Load MUST be assigned to the seeded DRIVER user's driver row for
    // `validateLoadAccess` to pass on the DRIVER JWT.
    const driverPublicId = seededDriverPublicId(authState);
    const setup = await createAssignedLoad(asDispatcher, asAdmin, {
      driverPublicId,
    });
    createdLoadIds.push(setup.loadId);
    // `createdDriver` is false — we reused the seeded driver — so NO
    // deactivation cleanup for this test.

    // Dispatcher sends a message — delivered-ack is meaningful only for
    // counterpart-authored messages. The controller's early-return
    // (`message.role === 'driver' → { success: true }`) would mask a real
    // persistence check if we acked a driver-authored message.
    const sendRes = await asDispatcher.post(
      `/loads/${setup.loadId}/messages`,
      buildLoadMessage({ content: 'QA delivered-ack dispatch origin' }),
    );
    expect(sendRes.status()).toBe(201);
    const sent = expectContract(
      LoadMessageSchema.strict(),
      await sendRes.json(),
      'POST /loads/:id/messages (setup for delivered-ack)',
    );
    expect(sent.role).toBe('dispatcher');

    // Driver marks delivered.
    const res = await asDriver.post(`/loads/${setup.loadId}/messages/${sent.id}/delivered`, {});
    expect(res.status()).toBe(201);
    const body = expectContract(
      MarkMessageDeliveredResponseSchema.strict(),
      await res.json(),
      'POST /loads/:id/messages/:mid/delivered',
    );
    expect(body.success).toBe(true);

    // Persistence: driver can still list the conversation (validateLoadAccess
    // accepts DRIVER when driverId matches), and the previously-sent
    // dispatcher message is visible.
    const listRes = await asDriver.get(`/loads/${setup.loadId}/messages`);
    expect(listRes.status()).toBe(200);
    const list = expectArrayContract(LoadMessageSchema.strict(), await listRes.json(), {
      context: 'GET /loads/:id/messages (driver, post-delivered)',
    });
    const seen = list.find((m) => m.id === sent.id);
    expect(seen).toBeDefined();
    expect(seen?.role).toBe('dispatcher');
  });
});

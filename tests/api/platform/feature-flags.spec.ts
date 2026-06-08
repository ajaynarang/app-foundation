/**
 * Platform — Feature Flags (Phase 4 Group 4a).
 *
 * Covers the 4 endpoints on `FeatureFlagsController`:
 *
 *   1. GET /feature-flags              — public. List all global flags.
 *   2. GET /feature-flags/:key         — public. Single flag by key.
 *   3. GET /feature-flags/:key/enabled — public. Thin `{ key, enabled }` shape.
 *   4. PUT /feature-flags/:key         — SUPER_ADMIN. Toggle enabled.
 *
 * Role fixtures: `asAnonymous` for the three public reads; `asSuperAdmin`
 * for the write. The write test captures the current value in `beforeAll`
 * and restores it in `afterAll` — flags are global, not tenant-scoped.
 *
 * Target flag for the mutation path: `agent_contract_v2`. It's a low-blast
 * radius flag (kill-switch for a future rollout) whose state doesn't affect
 * existing behaviour on demo-northstar-2026. We read → flip → verify →
 * restore. NEVER mutate a flag that another live test relies on.
 *
 * Schema strategy: re-export of shared-types `FeatureFlag*` schemas —
 * 1:1 match with controller output, no drift.
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract, PlatformSchemas } from '@sally/test-utils/schemas';

// Low-blast flag that isn't coupled to another test's behaviour. If this
// flag is ever turned into a required gate for production features, pick
// a different one.
const TEST_FLAG_KEY = 'agent_contract_v2';

test.describe('Platform · Feature Flags @workflow', () => {
  // 1 ── GET /feature-flags ─────────────────────────────────────────────────
  test('GET /feature-flags returns the list envelope for anonymous callers @workflow @contract', async ({
    asAnonymous,
  }) => {
    const res = await asAnonymous.get('/feature-flags');
    expect(res.status()).toBe(200);
    const body = expectContract(PlatformSchemas.FeatureFlagListSchema.strict(), await res.json(), 'GET /feature-flags');

    // Semantic — demo seeds > 10 flags. Each has a non-empty key + name +
    // category; every flag key is unique across the list.
    expect(body.flags.length).toBeGreaterThan(10);
    const keys = new Set(body.flags.map((f) => f.key));
    expect(keys.size).toBe(body.flags.length);
    for (const flag of body.flags) {
      expect(flag.key.length).toBeGreaterThan(0);
      expect(flag.name.length).toBeGreaterThan(0);
      expect(flag.category.length).toBeGreaterThan(0);
    }

    // The canary flag we'll toggle in test 4 is present.
    expect(keys.has(TEST_FLAG_KEY)).toBe(true);
  });

  // 2 ── GET /feature-flags/:key ────────────────────────────────────────────
  test('GET /feature-flags/:key returns a single flag + 404 on unknown key @workflow @contract', async ({
    asAnonymous,
  }) => {
    const res = await asAnonymous.get(`/feature-flags/${TEST_FLAG_KEY}`);
    expect(res.status()).toBe(200);
    const body = expectContract(
      PlatformSchemas.FeatureFlagSchema.strict(),
      await res.json(),
      `GET /feature-flags/${TEST_FLAG_KEY}`,
    );

    // Semantic — echoed key matches, enabled is a boolean, category present.
    expect(body.key).toBe(TEST_FLAG_KEY);
    expect(typeof body.enabled).toBe('boolean');
    expect(body.category.length).toBeGreaterThan(0);

    // Unknown key → 404 via NotFoundException.
    const missing = await asAnonymous.get('/feature-flags/phase-4-bogus-flag-does-not-exist');
    expect(missing.status()).toBe(404);
  });

  // 3 ── GET /feature-flags/:key/enabled ───────────────────────────────────
  test('GET /feature-flags/:key/enabled returns the thin { key, enabled } envelope @workflow @contract', async ({
    asAnonymous,
  }) => {
    const res = await asAnonymous.get(`/feature-flags/${TEST_FLAG_KEY}/enabled`);
    expect(res.status()).toBe(200);
    const body = expectContract(
      PlatformSchemas.FeatureFlagEnabledSchema.strict(),
      await res.json(),
      `GET /feature-flags/${TEST_FLAG_KEY}/enabled`,
    );

    expect(body.key).toBe(TEST_FLAG_KEY);
    expect(typeof body.enabled).toBe('boolean');

    // Cross-check against the full flag response — both paths must agree on
    // the current enabled value. Drift here would be a service bug.
    const full = await asAnonymous.get(`/feature-flags/${TEST_FLAG_KEY}`);
    expect(full.status()).toBe(200);
    const fullBody = await full.json();
    expect(body.enabled).toBe(fullBody.enabled);

    // Per the controller, `isEnabled` never throws a 404 for unknown keys
    // (the service returns false when the flag is missing). Document this
    // as a deliberate contrast with GET /feature-flags/:key — the enabled
    // endpoint returns `{ key: '<unknown>', enabled: false }` at 200.
    const unknownRes = await asAnonymous.get('/feature-flags/phase-4-bogus-flag-does-not-exist/enabled');
    expect(unknownRes.status()).toBe(200);
    const unknownBody = expectContract(PlatformSchemas.FeatureFlagEnabledSchema.strict(), await unknownRes.json());
    expect(unknownBody.enabled).toBe(false);
  });

  // 4 ── PUT /feature-flags/:key ───────────────────────────────────────────
  test('PUT /feature-flags/:key toggles a global flag (SUPER_ADMIN) and persists @workflow @destructive', async ({
    asSuperAdmin,
    asAnonymous,
  }) => {
    // Capture current enabled value so we can restore in-test (per-test
    // restore — see spec docstring on why global flags never get an
    // `afterAll` restore here).
    const preRes = await asAnonymous.get(`/feature-flags/${TEST_FLAG_KEY}`);
    expect(preRes.status()).toBe(200);
    const preBody = expectContract(PlatformSchemas.FeatureFlagSchema.strict(), await preRes.json());
    const originalEnabled = preBody.enabled;
    const newEnabled = !originalEnabled;

    try {
      // Write — flip to the inverted value.
      const putRes = await asSuperAdmin.put(`/feature-flags/${TEST_FLAG_KEY}`, { enabled: newEnabled });
      expect(putRes.status()).toBe(200);
      const putBody = expectContract(
        PlatformSchemas.FeatureFlagSchema.strict(),
        await putRes.json(),
        `PUT /feature-flags/${TEST_FLAG_KEY}`,
      );
      expect(putBody.key).toBe(TEST_FLAG_KEY);
      expect(putBody.enabled).toBe(newEnabled);

      // Persistence — second GET reports the new value.
      const verifyRes = await asAnonymous.get(`/feature-flags/${TEST_FLAG_KEY}`);
      expect(verifyRes.status()).toBe(200);
      const verifyBody = expectContract(PlatformSchemas.FeatureFlagSchema.strict(), await verifyRes.json());
      expect(verifyBody.enabled).toBe(newEnabled);

      // RBAC — anonymous callers cannot mutate (403/401 both acceptable
      // per the auth pipeline; the Roles guard emits 403 when the JWT is
      // present without SUPER_ADMIN, 401 when absent).
      const anonRes = await asAnonymous.put(`/feature-flags/${TEST_FLAG_KEY}`, { enabled: originalEnabled });
      expect([401, 403]).toContain(anonRes.status());
    } finally {
      // Restore — CRITICAL: flags are global. Restore in a `finally` so an
      // assertion failure above still returns the tenant to its original
      // state. If the restore itself fails, surface the error loudly so
      // follow-up tests notice the stale flag.
      const restoreRes = await asSuperAdmin.put(`/feature-flags/${TEST_FLAG_KEY}`, { enabled: originalEnabled });
      if (restoreRes.status() !== 200) {
        // eslint-disable-next-line no-console
        console.error(`feature-flags restore failed for ${TEST_FLAG_KEY}: HTTP ${restoreRes.status()}`);
      }
    }
  });
});

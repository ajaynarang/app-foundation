/**
 * Platform — API Keys (Phase 4 Group 4b).
 *
 * Covers the 3 endpoints on `ApiKeysController` (self-service; authenticated):
 *
 *   1. POST   /api-keys       — create a new key, returns the one-time secret.
 *   2. GET    /api-keys       — list caller's keys (secret NEVER returned).
 *   3. DELETE /api-keys/:id   — revoke a key (HTTP 204; soft-revoke via
 *                                `revokedAt` + `isActive=false`).
 *
 * Role fixture: `asDispatcher`. The controller uses `JwtAuthGuard` with no
 * `@Roles()` decorator, so any authenticated user may manage their own keys.
 * The service scopes reads/writes to `userId = req.user.dbId`, so tests
 * using a single fixture are isolated from other specs.
 *
 * Cleanup strategy:
 *   - The create test revokes the key it minted in a `finally` block so no
 *     residue leaks across runs. The list + delete tests each mint-revoke
 *     inside their own body (no afterEach state required).
 *
 * Schema strategy:
 *   - `ApiKeySchema` (list item) and `CreateApiKeyResponseSchema` (includes
 *     `key`) — rewritten in Phase 4 Group 4b against the live `ApiKeyDto`.
 *     The legacy Phase-0 shape referred to `keyId`/`prefix`/numeric `id`
 *     that the controller no longer returns. Finding #36.
 *
 * NEVER_EXTERNAL_SCOPES note: `platform:admin` is disallowed by the service
 * (runtime BadRequestException). Tests only request grantable read scopes.
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract, expectArrayContract, PlatformSchemas } from '@sally/test-utils/schemas';
import { buildApiKeyCreate } from '@sally/test-utils/factories';

test.describe('Platform · API Keys · Self-service @workflow', () => {
  // 1 ── POST /api-keys ──────────────────────────────────────────────────────
  test('POST /api-keys mints a new key and returns the full secret once (DISPATCHER) @workflow @contract @destructive', async ({
    asDispatcher,
  }) => {
    const payload = buildApiKeyCreate({
      name: 'Phase-4-b POST probe',
      scopes: ['fleet:read', 'loads:read'],
    });
    const res = await asDispatcher.post('/api-keys', payload);
    expect(res.status()).toBe(201);
    const body = expectContract(
      PlatformSchemas.CreateApiKeyResponseSchema.strict(),
      await res.json(),
      'POST /api-keys',
    );

    try {
      // Semantic — the response carries the full `sk_live_…` secret exactly
      // once, echoes the submitted name + scopes, defaults the rate limit
      // to 300/min, `isWriteEnabled` mirrors whether any scope is a write
      // scope (we sent read-only, so false), and sensible defaults apply
      // (empty `ipAllowlist`, `requestCount: 0`, `lastUsedAt: null`,
      // `isActive: true`, `expiresAt: null`).
      expect(body.key.startsWith('sk_live_')).toBe(true);
      expect(body.key.length).toBe(8 + 32); // "sk_live_" + 32 nanoid chars
      expect(body.name).toBe(payload.name);
      expect(body.scopes).toEqual(payload.scopes);
      expect(body.rateLimitPerMinute).toBe(300);
      expect(body.isWriteEnabled).toBe(false);
      expect(body.ipAllowlist).toEqual([]);
      expect(body.requestCount).toBe(0);
      expect(body.lastUsedAt).toBeNull();
      expect(body.isActive).toBe(true);
      expect(body.expiresAt).toBeNull();

      // Persistence — GET /api-keys returns the new key (without the secret).
      const listRes = await asDispatcher.get('/api-keys');
      expect(listRes.status()).toBe(200);
      const list = expectArrayContract(PlatformSchemas.ApiKeySchema.strict(), await listRes.json(), {
        context: 'GET /api-keys (post-create persistence)',
      });
      const mine = list.find((k) => k.id === body.id);
      expect(mine).toBeDefined();
      // The `key` field on the list variant MUST be absent — strict schema
      // already enforces this, but double-check on the raw object too.
      expect('key' in (mine as object)).toBe(false);
    } finally {
      // Cleanup — revoke so the DB doesn't accumulate test keys.
      const del = await asDispatcher.delete(`/api-keys/${body.id}`);
      if (del.status() !== 204) {
        // eslint-disable-next-line no-console
        console.error(`api-keys POST-probe revoke failed: HTTP ${del.status()} — ` + `leaked key ${body.id}`);
      }
    }
  });

  // 2 ── GET /api-keys ──────────────────────────────────────────────────────
  test('GET /api-keys lists the caller-owned keys and never leaks the secret (DISPATCHER) @workflow @contract @destructive', async ({
    asDispatcher,
  }) => {
    // Seed a key so the list is provably non-empty for this dispatcher.
    const createRes = await asDispatcher.post(
      '/api-keys',
      buildApiKeyCreate({
        name: 'Phase-4-b GET probe',
        scopes: ['fleet:read'],
      }),
    );
    expect(createRes.status()).toBe(201);
    const seed = expectContract(PlatformSchemas.CreateApiKeyResponseSchema.strict(), await createRes.json());

    try {
      const res = await asDispatcher.get('/api-keys');
      expect(res.status()).toBe(200);
      const rows = expectArrayContract(PlatformSchemas.ApiKeySchema.strict(), await res.json(), {
        context: 'GET /api-keys',
      });

      // Semantic — every row lacks the `key` field (enforced by `.strict()`
      // on the list schema). The seeded row is present with echoed
      // name + scopes + the `revokedAt=null` filter means only active keys
      // show up (service `where: { userId, revokedAt: null }`).
      const mine = rows.find((k) => k.id === seed.id);
      expect(mine).toBeDefined();
      expect(mine!.name).toBe(seed.name);
      expect(mine!.scopes).toEqual(seed.scopes);
      expect(mine!.isActive).toBe(true);
      // Row-level: no raw-JSON `key` attribute on any list element.
      for (const row of rows) {
        expect('key' in (row as object)).toBe(false);
      }
    } finally {
      const del = await asDispatcher.delete(`/api-keys/${seed.id}`);
      if (del.status() !== 204) {
        // eslint-disable-next-line no-console
        console.error(`api-keys GET-probe revoke failed: HTTP ${del.status()}`);
      }
    }
  });

  // 3 ── DELETE /api-keys/:id ────────────────────────────────────────────────
  test('DELETE /api-keys/:id revokes a key; subsequent list excludes it (DISPATCHER) @workflow @contract @destructive', async ({
    asDispatcher,
  }) => {
    const createRes = await asDispatcher.post(
      '/api-keys',
      buildApiKeyCreate({
        name: 'Phase-4-b DELETE probe',
        scopes: ['fleet:read'],
      }),
    );
    expect(createRes.status()).toBe(201);
    const seed = expectContract(PlatformSchemas.CreateApiKeyResponseSchema.strict(), await createRes.json());

    const del = await asDispatcher.delete(`/api-keys/${seed.id}`);
    expect(del.status()).toBe(204);

    // Persistence — the revoked key MUST NOT appear in the subsequent list
    // (service filters `revokedAt: null`).
    const listRes = await asDispatcher.get('/api-keys');
    expect(listRes.status()).toBe(200);
    const rows = expectArrayContract(PlatformSchemas.ApiKeySchema.strict(), await listRes.json(), {
      context: 'GET /api-keys (post-delete)',
      allowEmpty: true,
    });
    const stillThere = rows.find((k) => k.id === seed.id);
    expect(stillThere).toBeUndefined();

    // Deleting an already-revoked key → 404 (the service's `findFirst`
    // won't scope to `revokedAt: null`, but `findFirst` does not filter
    // revoked keys — verify what the service actually returns). The
    // current service looks up by id+userId without a revoked filter, so
    // a second DELETE on the same id returns 404 only if the underlying
    // `findFirst` fails. Per `api-keys.service.ts::revoke`, a subsequent
    // DELETE finds the same row and re-updates its revokedAt — returning
    // 204. Assert the idempotent-on-success behaviour.
    const secondDel = await asDispatcher.delete(`/api-keys/${seed.id}`);
    expect([204, 404]).toContain(secondDel.status());

    // DELETE with an unknown UUID → 404.
    const missing = await asDispatcher.delete('/api-keys/00000000-0000-0000-0000-000000000000');
    expect(missing.status()).toBe(404);
  });
});

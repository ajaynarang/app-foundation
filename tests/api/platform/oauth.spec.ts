/**
 * Platform — OAuth (Phase 4 Group 4g — FINAL group).
 *
 * Covers BOTH OAuth controllers — 10 tests across 2 describe blocks:
 *
 *   OAuth clients (authenticated CRUD — OWNER / ADMIN / SUPER_ADMIN):
 *     1. POST   /oauth/clients              — create; DISPATCHER 403 RBAC fence
 *     2. GET    /oauth/clients              — list tenant's clients
 *     3. GET    /oauth/clients/:clientId    — detail
 *     4. PUT    /oauth/clients/:clientId    — update
 *     5. DELETE /oauth/clients/:clientId    — revoke (204, soft-delete)
 *
 *   OAuth provider (RFC 6749 / 7009 / 7591, public):
 *     6. POST /oauth/register                — RFC 7591 DCR
 *     7. GET  /oauth/authorize               — 302 redirect to consent
 *     8. GET  /oauth/authorize (invalid)     — 400 on bogus client_id
 *     9. POST /oauth/token (invalid grant)   — 400 with `error: unsupported_grant_type`
 *    10. POST /oauth/revoke (bogus token)    — 200 empty body (RFC 7009 always-200)
 *
 * Why one file with two describe blocks:
 *   - The two controllers share a `/oauth/*` URL prefix AND the same DB
 *     model (`OAuthClient`). The DCR test (test 6) creates a client via the
 *     public /register endpoint; the cleanup revokes that SAME client via
 *     the admin DELETE endpoint. Splitting into two files would require
 *     either duplicating the admin-cleanup path or leaking DCR clients.
 *   - Rate-limit budget (finding #41 + §8.2) is most easily respected by
 *     ordering all rate-limited writes early in the spec: 1 POST /register,
 *     1 POST /token, 1 POST /revoke per run — well inside the 5/10/30-per-
 *     minute caps — with the CRUD block (unlimited) running after.
 *
 * Rate-limit budget per run:
 *   - POST /oauth/register:  1 hit (test 6)                        [5/min cap]
 *   - GET  /oauth/authorize: 2 hits (tests 7 + 8)                  [SkipThrottle → unbounded]
 *   - POST /oauth/token:     1 hit (test 9)                        [10/min cap]
 *   - POST /oauth/revoke:    1 hit (test 10)                       [30/min cap]
 *   Total: 4 rate-limited writes. Well inside every endpoint's cap.
 *
 * Rubric (per tests/README.md + the 9-criteria gate):
 *   - Role fixture from `@sally/test-utils/auth` (asOwner, asDispatcher,
 *     asAnonymous, asSuperAdmin).
 *   - Factories from `@sally/test-utils/factories` — buildOAuthClient,
 *     buildOAuthClientUpdate, buildOAuthRegister, buildOAuthAuthorizeParams,
 *     buildOAuthTokenBody, buildOAuthRevokeBody.
 *   - `expect(res.status()).toBe(N)` — exact numeric match.
 *   - `expectContract(Schema.strict(), body)` on every happy-path body.
 *   - Semantic assertion on every test (echo check, state change, header
 *     assertion, RFC key presence).
 *   - Persistence verified via a second request (list-membership after
 *     create, detail-GET after update).
 *   - Cleanup — every created client is revoked via DELETE in afterEach.
 *     The DCR test revokes its client via the admin DELETE path.
 *   - Tags: `@workflow @contract` baseline; `@destructive` on writes;
 *     `@rbac` on the 403 probe; `@oauth` on every test; `@public` on the
 *     RFC endpoints (the unauthenticated surface).
 *   - Zero runtime `test.skip(cond, …)`.
 *
 * Critical constraints:
 *   - Authorize test (test 7) uses `maxRedirects: 0` to intercept the 302
 *     without following into the (inactive) consent page. Playwright's
 *     APIRequestContext follows redirects by default. Do NOT follow the
 *     302 — the user decision Q3 limits authorize testing to header shape.
 *   - DCR client cleanup (test 6) uses the admin DELETE path (via
 *     `asSuperAdmin`), NOT the RFC 7591 `registration_client_uri` mechanism
 *     — the current controller does not expose a `registration_client_uri`
 *     in its DCR response (see finding #41 below), and the admin DELETE
 *     works against any client row regardless of origin.
 *   - client_secret leak safety: every test that reads a secret asserts
 *     its presence in-memory and never logs it. The afterEach cleanup
 *     ALWAYS invalidates the client so a leaked secret is worthless
 *     within seconds.
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract, expectArrayContract, PlatformSchemas } from '@sally/test-utils/schemas';
import {
  buildOAuthClient,
  buildOAuthClientUpdate,
  buildOAuthRegister,
  buildOAuthAuthorizeParams,
  buildOAuthTokenBody,
  buildOAuthRevokeBody,
} from '@sally/test-utils/factories';
import { createTestOAuthClient, deleteOAuthClientSafe, type TestOAuthClient } from './_helpers';

// ── OAuth clients (authenticated CRUD) ──────────────────────────────────────
test.describe('Platform · OAuth clients (authenticated CRUD) @workflow @oauth', () => {
  // 1 ── POST /oauth/clients + RBAC fence ───────────────────────────────────
  test('POST /oauth/clients creates a client with a one-time clientSecret (OWNER) + DISPATCHER 403 @workflow @contract @destructive @rbac @oauth', async ({
    asOwner,
    asDispatcher,
    asSuperAdmin,
  }) => {
    // RBAC fence — `@Roles(ADMIN, OWNER, SUPER_ADMIN)` on the controller.
    // DISPATCHER is tenant-scoped but not admin; the Roles guard must
    // reject BEFORE the DTO pipe runs. A full payload is supplied so the
    // 403 is provably role-sourced, not a validation 400.
    const rbacPayload = buildOAuthClient();
    const rbacRes = await asDispatcher.post('/oauth/clients', rbacPayload);
    expect(rbacRes.status()).toBe(403);

    // Happy path — OWNER creates a new client.
    let createdClientId: string | undefined;
    try {
      const payload = buildOAuthClient({
        name: '[QA-TEST] Phase-4g oauth create probe',
        scopes: ['fleet:read', 'invoices:read'],
      });
      const res = await asOwner.post('/oauth/clients', payload);
      expect(res.status()).toBe(201);
      const body = expectContract(
        PlatformSchemas.OAuthClientCreatedResponseSchema.strict(),
        await res.json(),
        'POST /oauth/clients',
      );
      createdClientId = body.clientId;

      // Semantic — payload echoed, client_id carries the `sally_` prefix
      // (service minted via nanoid), clientSecret is a non-empty plaintext
      // string that is returned EXACTLY ONCE, clientType defaults to
      // 'confidential', isActive is true.
      expect(body.name).toBe(payload.name);
      expect(body.redirectUris).toEqual(payload.redirectUris);
      expect(body.scopes).toEqual(payload.scopes);
      expect(body.clientType).toBe('confidential');
      expect(body.isActive).toBe(true);
      expect(body.clientId.startsWith('sally_')).toBe(true);
      expect(body.clientSecret.length).toBeGreaterThan(32);

      // Persistence — GET /oauth/clients/:clientId returns the row WITHOUT
      // the clientSecret (the secret is returned ONCE on create and never
      // again). `.strict()` on the list-item schema means a leaked secret
      // would fail the contract assertion.
      const detailRes = await asOwner.get(`/oauth/clients/${body.clientId}`);
      expect(detailRes.status()).toBe(200);
      const detail = expectContract(
        PlatformSchemas.OAuthClientSchema.strict(),
        await detailRes.json(),
        `GET /oauth/clients/${body.clientId}`,
      );
      expect(detail.clientId).toBe(body.clientId);
      expect((detail as unknown as { clientSecret?: unknown }).clientSecret).toBeUndefined();
    } finally {
      // Cleanup — revoke via SUPER_ADMIN so the cleanup succeeds even if the
      // OWNER fixture's tenant scope drifted during the test body.
      await deleteOAuthClientSafe(asSuperAdmin, createdClientId);
    }
  });

  // 2 ── GET /oauth/clients ──────────────────────────────────────────────────
  test('GET /oauth/clients lists the tenant clients and the fresh row appears (OWNER) @workflow @contract @oauth', async ({
    asOwner,
    asSuperAdmin,
  }) => {
    let client: TestOAuthClient | undefined;
    try {
      client = await createTestOAuthClient(asOwner, {
        name: '[QA-TEST] Phase-4g oauth list probe',
      });

      const res = await asOwner.get('/oauth/clients');
      expect(res.status()).toBe(200);
      const rows = expectArrayContract(PlatformSchemas.OAuthClientListItemSchema.strict(), await res.json(), {
        context: 'GET /oauth/clients',
      });

      // Semantic — the fresh client surfaces in the list, every row
      // shares the tenant (the controller scopes the query by tenantDbId
      // when the caller is non-SUPER_ADMIN), and the secret is NEVER
      // included on the list projection.
      expect(rows.length).toBeGreaterThan(0);
      const seen = rows.find((r) => r.clientId === client!.clientId);
      expect(seen, 'fresh client must appear in GET /oauth/clients').toBeDefined();
      expect(seen!.name).toBe(client!.name);
      expect(seen!.isActive).toBe(true);
      for (const row of rows) {
        expect(row.clientId.startsWith('sally_')).toBe(true);
        expect((row as unknown as { clientSecret?: unknown }).clientSecret).toBeUndefined();
      }
    } finally {
      await deleteOAuthClientSafe(asSuperAdmin, client?.clientId);
    }
  });

  // 3 ── GET /oauth/clients/:clientId ───────────────────────────────────────
  test('GET /oauth/clients/:clientId returns the detail row without the secret (OWNER) @workflow @contract @oauth', async ({
    asOwner,
    asSuperAdmin,
  }) => {
    let client: TestOAuthClient | undefined;
    try {
      client = await createTestOAuthClient(asOwner, {
        name: '[QA-TEST] Phase-4g oauth detail probe',
        scopes: ['fleet:read', 'fleet:write'],
      });

      const res = await asOwner.get(`/oauth/clients/${client.clientId}`);
      expect(res.status()).toBe(200);
      const body = expectContract(
        PlatformSchemas.OAuthClientSchema.strict(),
        await res.json(),
        `GET /oauth/clients/${client.clientId}`,
      );

      // Semantic — detail matches the created row exactly on every
      // non-secret field; the secret is absent (returned once on create).
      expect(body.clientId).toBe(client.clientId);
      expect(body.name).toBe(client.name);
      expect(body.scopes).toEqual(client.scopes);
      expect(body.redirectUris).toEqual(client.redirectUris);
      expect(body.clientType).toBe(client.clientType);
      expect(body.isActive).toBe(true);
      expect((body as unknown as { clientSecret?: unknown }).clientSecret).toBeUndefined();

      // Persistence — unknown clientId returns 404 (service throws
      // NotFoundException when the row doesn't match).
      const missingRes = await asOwner.get('/oauth/clients/sally_qa-bogus-does-not-exist');
      expect(missingRes.status()).toBe(404);
    } finally {
      await deleteOAuthClientSafe(asSuperAdmin, client?.clientId);
    }
  });

  // 4 ── PUT /oauth/clients/:clientId ───────────────────────────────────────
  test('PUT /oauth/clients/:clientId updates name + persists (OWNER) @workflow @contract @destructive @oauth', async ({
    asOwner,
    asSuperAdmin,
  }) => {
    let client: TestOAuthClient | undefined;
    try {
      client = await createTestOAuthClient(asOwner, {
        name: '[QA-TEST] Phase-4g before-put',
      });

      const payload = buildOAuthClientUpdate({
        name: '[QA-TEST] Phase-4g after-put',
      });
      const res = await asOwner.put(`/oauth/clients/${client.clientId}`, payload);
      expect(res.status()).toBe(200);
      const body = expectContract(
        PlatformSchemas.OAuthClientSchema.strict(),
        await res.json(),
        `PUT /oauth/clients/${client.clientId}`,
      );

      // Semantic — name flipped, all other fields preserved, secret
      // absent (never re-issued on update).
      expect(body.name).toBe(payload.name);
      expect(body.clientId).toBe(client.clientId);
      expect(body.scopes).toEqual(client.scopes);
      expect(body.redirectUris).toEqual(client.redirectUris);
      expect(body.isActive).toBe(true);
      expect((body as unknown as { clientSecret?: unknown }).clientSecret).toBeUndefined();

      // Persistence — the next GET reflects the updated name.
      const verifyRes = await asOwner.get(`/oauth/clients/${client.clientId}`);
      expect(verifyRes.status()).toBe(200);
      const verify = expectContract(PlatformSchemas.OAuthClientSchema.strict(), await verifyRes.json());
      expect(verify.name).toBe(payload.name);
    } finally {
      await deleteOAuthClientSafe(asSuperAdmin, client?.clientId);
    }
  });

  // 5 ── DELETE /oauth/clients/:clientId ────────────────────────────────────
  test('DELETE /oauth/clients/:clientId revokes the client (204; isActive=false) (OWNER) @workflow @contract @destructive @oauth', async ({
    asOwner,
  }) => {
    const client = await createTestOAuthClient(asOwner, {
      name: '[QA-TEST] Phase-4g delete probe',
    });

    const res = await asOwner.delete(`/oauth/clients/${client.clientId}`);
    expect(res.status()).toBe(204);
    // 204 → No Content per HTTP spec. The controller decorates with
    // `@HttpCode(HttpStatus.NO_CONTENT)`. No body to contract-check.
    const bodyText = await res.text();
    expect(bodyText).toBe('');

    // Persistence — the revoke transitions the row to `isActive=false`
    // (soft-delete; the service's `revoke` updates the row instead of
    // deleting). GET still returns the row but with isActive flipped.
    const verifyRes = await asOwner.get(`/oauth/clients/${client.clientId}`);
    expect(verifyRes.status()).toBe(200);
    const verify = expectContract(
      PlatformSchemas.OAuthClientSchema.strict(),
      await verifyRes.json(),
      `GET /oauth/clients/${client.clientId} (post-revoke)`,
    );
    expect(verify.clientId).toBe(client.clientId);
    expect(verify.isActive).toBe(false);
  });
});

// ── OAuth provider (RFC 7591 / 7009 / 6749, public) ─────────────────────────
test.describe('Platform · OAuth provider (RFC 7591 / 7009 / 6749) @workflow @oauth @public', () => {
  // 6 ── POST /oauth/register — RFC 7591 Dynamic Client Registration ────────
  //
  // First in the describe block so the 5/min rate-limit has maximum
  // headroom on the second run. The DCR client is cleaned up via the
  // admin DELETE endpoint so no dangling clients leak to the next run.
  test('POST /oauth/register creates a public client per RFC 7591 (ANONYMOUS) @workflow @contract @destructive @oauth @public', async ({
    asAnonymous,
    asSuperAdmin,
  }) => {
    let dcrClientId: string | undefined;
    try {
      const payload = buildOAuthRegister({
        client_name: '[QA-TEST] Phase-4g DCR public',
      });
      const res = await asAnonymous.post('/oauth/register', payload);
      expect(res.status()).toBe(201);
      const body = expectContract(
        PlatformSchemas.OAuthDCRResponseSchema.strict(),
        await res.json(),
        'POST /oauth/register (public client)',
      );
      dcrClientId = body.client_id;

      // Semantic — the response echoes the registered metadata in RFC
      // 7591 form. Public client (`token_endpoint_auth_method: 'none'`)
      // means NO `client_secret` is issued per RFC 7591 §3.2.1. The
      // service auto-assigns the full OAUTH_SCOPES list when the caller
      // omits `scope`; assert the echoed scope is a non-empty space-
      // delimited string.
      expect(body.client_id.startsWith('sally_')).toBe(true);
      expect(body.client_name).toBe(payload.client_name);
      expect(body.redirect_uris).toEqual(payload.redirect_uris);
      expect(body.grant_types).toEqual(payload.grant_types);
      expect(body.token_endpoint_auth_method).toBe('none');
      expect(body.client_secret).toBeUndefined();
      expect(body.client_secret_expires_at).toBeUndefined();
      expect(body.scope.length).toBeGreaterThan(0);
      expect(body.scope.split(' ').length).toBeGreaterThanOrEqual(1);
      expect(body.client_id_issued_at).toBeGreaterThan(0);

      // Persistence — the DCR client IS visible on the admin list path
      // (no tenantId → surfaces under the SUPER_ADMIN global view, where
      // the service uses `where: { tenantId: null }`).
      const listRes = await asSuperAdmin.get('/oauth/clients');
      expect(listRes.status()).toBe(200);
      const rows = expectArrayContract(PlatformSchemas.OAuthClientListItemSchema.strict(), await listRes.json());
      const seen = rows.find((r) => r.clientId === dcrClientId);
      expect(seen, 'DCR client must appear in SUPER_ADMIN /oauth/clients list').toBeDefined();
      expect(seen!.clientType).toBe('public');
    } finally {
      // Cleanup — revoke via SUPER_ADMIN. The DCR client carries `tenantId:
      // null`, so only SUPER_ADMIN can revoke it (the controller's
      // `tenantId !== null` branch applies to non-super-admin callers).
      await deleteOAuthClientSafe(asSuperAdmin, dcrClientId);
    }
  });

  // 7 ── GET /oauth/authorize — 302 to consent page ─────────────────────────
  //
  // Happy-path authorize: assert the 302 Location header shape. Do NOT
  // follow the redirect (user decision Q3). Playwright's APIRequestContext
  // follows redirects by default, so the call passes `maxRedirects: 0` to
  // capture the raw 302.
  test('GET /oauth/authorize returns 302 with consent-page Location header (ANONYMOUS) @workflow @contract @oauth @public', async ({
    asAnonymous,
    asOwner,
    asSuperAdmin,
  }) => {
    // Mint a fresh client so the authorize request passes the client
    // lookup + redirect-URI check + scope match.
    let client: TestOAuthClient | undefined;
    try {
      client = await createTestOAuthClient(asOwner, {
        name: '[QA-TEST] Phase-4g authorize probe',
        scopes: ['fleet:read'],
        redirectUris: ['http://localhost:3000/oauth/callback'],
      });

      const params = buildOAuthAuthorizeParams({
        client_id: client.clientId,
        redirect_uri: 'http://localhost:3000/oauth/callback',
        scope: 'fleet:read',
      });
      const query = new URLSearchParams(params as unknown as Record<string, string>).toString();

      // maxRedirects: 0 → stop at the 302 and expose the Location header.
      const res = await asAnonymous.get(`/oauth/authorize?${query}`, {
        maxRedirects: 0,
      });
      expect(res.status()).toBe(302);

      const location = res.headers()['location'];
      expect(location, 'Location header must be set on 302').toBeDefined();
      expect(typeof location).toBe('string');

      // Semantic — the Location URL points at the frontend consent page
      // and carries a `challenge=<jwt>` query param. The state /
      // client_id / code_challenge are embedded INSIDE the JWT (verified
      // against oauth-provider.service.ts::authorize), not echoed as
      // flat query params — so we assert the consent-route path and the
      // non-empty challenge parameter, not the flat param shape.
      const locationUrl = new URL(location);
      expect(locationUrl.pathname).toBe('/oauth/consent');
      const challenge = locationUrl.searchParams.get('challenge');
      expect(challenge).not.toBeNull();
      expect(challenge!.length).toBeGreaterThan(50); // JWTs are always >50 chars

      // JWT structure sanity — 3 base64url segments separated by `.`.
      expect(challenge!.split('.').length).toBe(3);
    } finally {
      await deleteOAuthClientSafe(asSuperAdmin, client?.clientId);
    }
  });

  // 8 ── GET /oauth/authorize — invalid client_id 400 ───────────────────────
  //
  // RFC 6749 §4.1.2.1: when the authorization request fails due to a
  // bogus client_id, the server SHOULD NOT redirect the user-agent;
  // instead it returns an HTTP-level error. Sally emits 400 with the
  // filter envelope + `message: 'Invalid client_id'`. Asserts the
  // specific error keys rather than blindly matching the schema.
  test('GET /oauth/authorize with a bogus client_id returns 400 (ANONYMOUS) @workflow @contract @oauth @public', async ({
    asAnonymous,
  }) => {
    const params = buildOAuthAuthorizeParams({
      client_id: 'sally_qa-phase-4g-does-not-exist',
    });
    const query = new URLSearchParams(params as unknown as Record<string, string>).toString();

    const res = await asAnonymous.get(`/oauth/authorize?${query}`, {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(400);
    const body = expectContract(
      PlatformSchemas.OAuthErrorResponseSchema.strict(),
      await res.json(),
      'GET /oauth/authorize (bogus client_id)',
    );

    // Semantic — the service throws a string-form
    // `BadRequestException('Invalid client_id')`, which surfaces in the
    // Sally envelope as `detail: 'Invalid client_id'` + `error: 'Bad Request'`
    // + `message: 'Invalid client_id'`. Pin both layers so a future
    // refactor to a structured `{error: 'invalid_client'}` throw is
    // caught by the assertion.
    expect(body.statusCode).toBe(400);
    expect(body.detail).toBe('Invalid client_id');
    expect(body.message).toBe('Invalid client_id');
  });

  // 9 ── POST /oauth/token — invalid grant_type 400 ─────────────────────────
  //
  // RFC 6749 §5.2: token-endpoint errors use HTTP 400 with a
  // `{error: '<rfc-code>', error_description: '...'}` envelope. Sally's
  // controller throws the structured object form, which the
  // HttpExceptionFilter preserves alongside the envelope — so the RFC
  // keys sit on TOP of the `{statusCode, timestamp, path, method, detail}`
  // base.
  test('POST /oauth/token with unsupported grant_type returns 400 with RFC 6749 error keys (ANONYMOUS) @workflow @contract @oauth @public', async ({
    asAnonymous,
  }) => {
    const payload = buildOAuthTokenBody({
      grant_type: 'qa-phase-4g-unsupported',
    });
    const res = await asAnonymous.post('/oauth/token', payload);
    expect(res.status()).toBe(400);
    const body = expectContract(
      PlatformSchemas.OAuthErrorResponseSchema.strict(),
      await res.json(),
      'POST /oauth/token (unsupported grant)',
    );

    // Semantic — the RFC keys are present on the envelope:
    //   error: 'unsupported_grant_type'   (RFC 6749 §5.2)
    //   error_description: non-empty string (RFC 6749 §5.2 allows optional)
    // `detail` falls back to 'Request failed' (filter default when the
    // object payload has neither `detail` nor `message`).
    expect(body.statusCode).toBe(400);
    expect(body.error).toBe('unsupported_grant_type');
    expect(body.error_description).toBeDefined();
    expect(body.error_description!.length).toBeGreaterThan(0);
    expect(body.detail).toBe('Request failed');
  });

  // 10 ── POST /oauth/revoke — RFC 7009 always-200 ──────────────────────────
  //
  // RFC 7009 §2.2: "The authorization server responds with HTTP status
  // code 200 if the token has been revoked successfully or if the client
  // submitted an invalid token." This prevents token-enumeration attacks
  // — the server MUST NOT reveal whether the token existed. Sally's
  // controller returns an empty JSON object `{}` on every non-missing-
  // token body; missing-`token` bodies return 400 instead (that's a
  // contract-validation error, not a revocation error).
  test('POST /oauth/revoke with a bogus token returns 200 + empty body per RFC 7009 (ANONYMOUS) @workflow @contract @destructive @oauth @public', async ({
    asAnonymous,
  }) => {
    const payload = buildOAuthRevokeBody();
    const res = await asAnonymous.post('/oauth/revoke', payload);
    expect(res.status()).toBe(200);
    const body = expectContract(
      PlatformSchemas.OAuthRevokeResponseSchema.strict(),
      await res.json(),
      'POST /oauth/revoke (bogus token)',
    );

    // Semantic — the body is the empty object literal `{}`. `.strict()`
    // means any accidental leak (e.g. the revoked-at timestamp, the
    // token hash) would fail the contract. This IS the RFC 7009 §2.2
    // anti-enumeration contract — pinning it here prevents a future
    // refactor from accidentally leaking "token found"/"token not found"
    // hints via the response body.
    expect(Object.keys(body).length).toBe(0);
  });
});

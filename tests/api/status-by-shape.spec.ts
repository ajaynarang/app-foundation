import { test, expect } from '../fixtures/auth.fixture.js';
import { Helpers } from '@app/test-utils/schemas';

/**
 * The success status follows the route's shape (ADR "API contract", section 1), read off a running backend.
 * `api-contract.spec.ts` holds the same rules against the source; this holds a few of them against the wire, so a
 * status that a decorator declares and the server does not answer shows up before a pull request is opened.
 *
 * Every request here is safe to repeat: nothing is created and nothing is deleted.
 */
test.describe('Status by route shape @api', () => {
  test('a POST with nothing to return answers 204 and no body', async ({ asAnonymous }) => {
    // An address nobody has: the route answers the same either way, so an account cannot be probed.
    const res = await asAnonymous.post('/auth/forgot-password', { email: 'nobody@status-by-shape.invalid' });
    expect(res.status()).toBe(204);
    expect(await res.text()).toBe('');
  });

  test('an action POST answers 200, not 201', async ({ asMember }) => {
    const res = await asMember.post('/notifications/mark-all-read', {});
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ updated: expect.any(Number) });
  });

  test('the MCP stream probe answers 405 through the error envelope', async ({ asAnonymous }) => {
    const res = await asAnonymous.get('/mcp');
    expect(res.status()).toBe(405);
    const body = await res.json();
    expect(Helpers.apiErrorEnvelope(405).safeParse(body).success, JSON.stringify(body)).toBe(true);
    expect(body.code).toBe('METHOD_NOT_ALLOWED');
  });

  test('an MCP call without a token answers 401 with the bearer challenge', async ({ asAnonymous }) => {
    const res = await asAnonymous.post('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(res.status()).toBe(401);
    expect(res.headers()['www-authenticate']).toMatch(/^Bearer .*resource_metadata="/);
    expect(Helpers.apiErrorEnvelope(401).safeParse(await res.json()).success).toBe(true);
  });
});

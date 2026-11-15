import { randomUUID } from 'crypto';
import { test, expect } from '../fixtures/auth.fixture.js';

/**
 * Retries are safe (ADR "API contract", section 5), read off a running backend with its real Redis.
 * `idempotency.spec.ts` in the platform package holds the mechanism; this holds the wiring: the interceptor is
 * global, it sees the signed-in tenant and user, the replay marker is set, and a browser may send the key.
 *
 * Each run creates one support ticket under a fresh key.
 */
test.describe('Idempotency-Key @api', () => {
  test('a retried create replays the first response; a new body under the same key is a 409', async ({ asMember }) => {
    const key = randomUUID();
    const body = { subject: `Idempotency check ${key}`, description: 'Created by tests/api/idempotency.spec.ts' };
    const headers = { 'Idempotency-Key': key };

    const first = await asMember.post('/support/tickets', body, { headers });
    expect(first.status()).toBe(201);
    expect(first.headers()['idempotent-replayed']).toBeUndefined();
    const created = await first.json();

    const retry = await asMember.post('/support/tickets', body, { headers });
    expect(retry.status()).toBe(201);
    expect(retry.headers()['idempotent-replayed']).toBe('true');
    expect(await retry.json()).toEqual(created);

    const reused = await asMember.post('/support/tickets', { ...body, description: 'Another body' }, { headers });
    expect(reused.status()).toBe(409);
    expect((await reused.json()).code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  test('an unusable key is a 400 that names the header', async ({ asMember }) => {
    const res = await asMember.post(
      '/support/tickets',
      { subject: 'Never created', description: 'The key is refused first' },
      { headers: { 'Idempotency-Key': 'has a space' } },
    );
    expect(res.status()).toBe(400);
    expect((await res.json()).fieldErrors).toHaveProperty(['Idempotency-Key']);
  });

  test('CORS lets a browser send the key and read the replay marker', async ({ request, authState }) => {
    const origin = 'http://localhost:3000';
    const preflight = await request.fetch(`${authState.baseUrl}/support/tickets`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,idempotency-key',
      },
    });
    expect(preflight.status()).toBeLessThan(300);
    expect(preflight.headers()['access-control-allow-headers'].toLowerCase()).toContain('idempotency-key');

    const read = await request.get(`${authState.baseUrl}/health`, { headers: { Origin: origin } });
    expect((read.headers()['access-control-expose-headers'] ?? '').toLowerCase()).toContain('idempotent-replayed');
  });
});

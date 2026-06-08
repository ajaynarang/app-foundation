import { test, expect } from '../fixtures/auth.fixture.js';

test.describe('Security headers @smoke', () => {
  test('X-Frame-Options is DENY', async ({ asAnonymous }) => {
    const res = await asAnonymous.get('/health/live');
    expect(res.headers()['x-frame-options']?.toLowerCase()).toBe('deny');
  });

  test('X-Content-Type-Options is nosniff', async ({ asAnonymous }) => {
    const res = await asAnonymous.get('/health/live');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
  });

  test('Content-Security-Policy is present', async ({ asAnonymous }) => {
    const res = await asAnonymous.get('/health/live');
    expect(res.headers()['content-security-policy']).toBeTruthy();
  });

  test('Referrer-Policy is set', async ({ asAnonymous }) => {
    const res = await asAnonymous.get('/health/live');
    expect(res.headers()['referrer-policy']).toBeTruthy();
  });

  test('Strict-Transport-Security is set', async ({ asAnonymous }) => {
    const res = await asAnonymous.get('/health/live');
    expect(res.headers()['strict-transport-security']).toBeTruthy();
  });
});

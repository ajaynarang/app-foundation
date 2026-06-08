import { test, expect } from '../fixtures/auth.fixture.js';

test.describe('Health Checks @smoke', () => {
  test('GET /health/live returns 200', async ({ asAnonymous }) => {
    const res = await asAnonymous.get('/health/live');
    expect(res.ok(), `health/live returned ${res.status()}`).toBeTruthy();
  });

  test('GET /health/ready returns 200 with dependency status', async ({ asAnonymous }) => {
    const res = await asAnonymous.get('/health/ready');
    expect(res.ok(), `health/ready returned ${res.status()}`).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('status');
  });
});

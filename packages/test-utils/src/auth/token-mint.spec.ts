import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchDevUsers, switchToUser } from './token-mint.js';

describe('token-mint', () => {
  const ORIG = process.env.DEV_AUTH_SECRET;
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    if (ORIG !== undefined) process.env.DEV_AUTH_SECRET = ORIG;
    else delete process.env.DEV_AUTH_SECRET;
  });

  it('throws when DEV_AUTH_SECRET missing', async () => {
    delete process.env.DEV_AUTH_SECRET;
    await expect(fetchDevUsers('http://x')).rejects.toThrow(/DEV_AUTH_SECRET/);
  });

  it('fetchDevUsers sends x-dev-auth-secret header', async () => {
    process.env.DEV_AUTH_SECRET = 'test-secret';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tenants: [], superAdmins: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchDevUsers('http://x');

    expect(fetchMock).toHaveBeenCalledWith('http://x/dev/users', { headers: { 'x-dev-auth-secret': 'test-secret' } });
  });

  it('switchToUser posts userId with secret header', async () => {
    process.env.DEV_AUTH_SECRET = 'test-secret';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: 'jwt-123' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const token = await switchToUser('http://x', 'u1');

    expect(token).toBe('jwt-123');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://x/dev/switch',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-dev-auth-secret': 'test-secret' }),
        body: JSON.stringify({ userId: 'u1' }),
      }),
    );
  });

  it('fetchDevUsers throws on non-ok response', async () => {
    process.env.DEV_AUTH_SECRET = 'test-secret';
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchDevUsers('http://x')).rejects.toThrow(/401/);
  });

  it('switchToUser throws on non-ok response', async () => {
    process.env.DEV_AUTH_SECRET = 'test-secret';
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(switchToUser('http://x', 'u1')).rejects.toThrow(/500/);
  });
});

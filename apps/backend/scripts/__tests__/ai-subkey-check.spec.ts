import { runSubKeyCheck } from '../ai-subkey-check';

const MGMT = 'sk-or-mgmt-test';
const RUNTIME_KEY = 'sk-or-v1-runtime-test';

/** The live sub-key check calls OpenRouter by hand; this runs its wiring offline with fetch mocked. */
describe('ai-subkey-check (offline)', () => {
  let fetchSpy: jest.SpyInstance;
  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch' as never);
  });
  afterEach(() => fetchSpy.mockRestore());

  const res = (status: number, body: unknown = {}) => ({ ok: status < 400, status, json: async () => body });

  it('is skipped and sends nothing when the management key is unset', async () => {
    await expect(runSubKeyCheck({})).resolves.toEqual({ lines: [], skipped: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('creates, caps, reads and revokes one key by its hash, and proves it is gone', async () => {
    let deleted = false;
    fetchSpy.mockImplementation(async (url: string, init: any) => {
      if (init.method === 'POST') return res(200, { key: RUNTIME_KEY, data: { hash: 'h1' } });
      if (init.method === 'PATCH') return res(200);
      if (init.method === 'DELETE') {
        deleted = true;
        return res(200);
      }
      return deleted ? res(404) : res(200, { data: { hash: 'h1', limit: 2, limit_reset: 'monthly' } });
    });

    const { lines } = await runSubKeyCheck({ OPENROUTER_PROVISIONING_KEY: MGMT }, () => 42);

    expect(lines.map((l) => [l.step, l.ok])).toEqual([
      ['create', true],
      ['cap', true],
      ['read', true],
      ['revoke', true],
      ['revoked', true],
    ]);
    const [createUrl, createInit] = fetchSpy.mock.calls[0];
    expect(createUrl).toBe('https://openrouter.ai/api/v1/keys');
    expect(JSON.parse(createInit.body)).toEqual({ name: 'subkey-check-42', limit: 1, limit_reset: 'monthly' });
    expect(fetchSpy.mock.calls.filter(([, i]: any[]) => i.method === 'DELETE')[0][0]).toBe(
      'https://openrouter.ai/api/v1/keys/h1',
    );
    // Neither key reaches the printed lines.
    const printed = lines.map((l) => l.detail).join('\n');
    expect(printed).not.toContain(RUNTIME_KEY);
    expect(printed).not.toContain(MGMT);
  });

  it('fails the read step when the cap did not take', async () => {
    fetchSpy.mockImplementation(async (_url: string, init: any) => {
      if (init.method === 'POST') return res(200, { key: RUNTIME_KEY, hash: 'h2' });
      if (init.method === 'GET') return res(200, { data: { limit: 1, limit_reset: null } });
      return res(200);
    });
    const { lines } = await runSubKeyCheck({ OPENROUTER_PROVISIONING_KEY: MGMT });
    expect(lines.find((l) => l.step === 'read')?.ok).toBe(false);
  });

  it('a failed revoke prints the hash for manual deletion', async () => {
    fetchSpy.mockImplementation(async (_url: string, init: any) => {
      if (init.method === 'POST') return res(200, { key: RUNTIME_KEY, hash: 'h3' });
      if (init.method === 'DELETE') return res(500);
      if (init.method === 'GET') return res(200, { data: { limit: 2, limit_reset: 'monthly' } });
      return res(200);
    });
    const { lines } = await runSubKeyCheck({ OPENROUTER_PROVISIONING_KEY: MGMT });
    const revoke = lines.find((l) => l.step === 'revoke');
    expect(revoke?.ok).toBe(false);
    expect(revoke?.detail).toContain('delete h3 by hand');
  });
});

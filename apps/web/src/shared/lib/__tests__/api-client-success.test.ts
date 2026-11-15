import { ApiError, apiClient, apiFetchRaw } from '@appshore/web-core/shared/lib/api';

// Names starting with `mock` are the ones a jest.mock factory may close over.
const mockSignOut = jest.fn();
const mockSetTokens = jest.fn();

jest.mock('@appshore/web-core/auth/session-bridge', () => ({
  getSessionStore: () => ({
    getState: () => ({ accessToken: 'token', signOut: mockSignOut, setTokens: mockSetTokens, setUser: jest.fn() }),
  }),
}));

/** A fetch Response stand-in whose body can be read once, as text or JSON, like the real one. */
const response = (status: number, body: string) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
  json: async () => JSON.parse(body),
});

const fetchMock = () => global.fetch as unknown as jest.Mock;

beforeEach(() => {
  mockSignOut.mockClear();
  mockSetTokens.mockClear();
});

describe('apiClient reads a success body', () => {
  it.each([200, 201, 202])('an empty body on a %i is undefined, not a JSON parse error', async (status) => {
    global.fetch = jest.fn().mockResolvedValue(response(status, '')) as unknown as typeof fetch;
    await expect(apiClient('/things', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('a 204 is undefined and its body is never read', async () => {
    const noContent = { ...response(204, ''), text: jest.fn(), json: jest.fn() };
    global.fetch = jest.fn().mockResolvedValue(noContent) as unknown as typeof fetch;
    await expect(apiClient('/things/1', { method: 'DELETE' })).resolves.toBeUndefined();
    expect(noContent.text).not.toHaveBeenCalled();
    expect(noContent.json).not.toHaveBeenCalled();
  });

  it('a JSON body is parsed', async () => {
    global.fetch = jest.fn().mockResolvedValue(response(200, '{"id":"thing_1"}')) as unknown as typeof fetch;
    await expect(apiClient('/things/1')).resolves.toEqual({ id: 'thing_1' });
  });
});

describe('apiFetchRaw', () => {
  it('returns the raw Response with the bearer token and cookies, and sets no JSON content type', async () => {
    const raw = response(200, 'binary');
    global.fetch = jest.fn().mockResolvedValue(raw) as unknown as typeof fetch;

    await expect(apiFetchRaw('/exports/1')).resolves.toBe(raw);

    const [url, init] = fetchMock().mock.calls[0];
    expect(url).toMatch(/\/exports\/1$/);
    expect(init.credentials).toBe('include');
    expect(init.headers).toEqual({ Authorization: 'Bearer token' });
  });

  it('hands back a failed Response too: the caller reads the status', async () => {
    const missing = response(404, '{"detail":"Not found"}');
    global.fetch = jest.fn().mockResolvedValue(missing) as unknown as typeof fetch;
    await expect(apiFetchRaw('/exports/missing')).resolves.toBe(missing);
  });

  it('refreshes once on a 401 and retries with the new token', async () => {
    const file = response(200, 'binary');
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(response(401, ''))
      .mockResolvedValueOnce(response(200, '{"accessToken":"fresh"}')) // POST /auth/refresh
      .mockResolvedValueOnce(file) as unknown as typeof fetch;

    await expect(apiFetchRaw('/exports/1')).resolves.toBe(file);

    expect(fetchMock().mock.calls[1][0]).toMatch(/\/auth\/refresh$/);
    expect(mockSetTokens).toHaveBeenCalledWith('fresh');
    expect(fetchMock()).toHaveBeenCalledTimes(3);
  });

  it('fails with a 401 ApiError when the refresh fails, and does not retry again', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(response(401, ''))
      .mockResolvedValueOnce(response(401, '')) as unknown as typeof fetch;

    const error = await apiFetchRaw('/exports/1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });
});

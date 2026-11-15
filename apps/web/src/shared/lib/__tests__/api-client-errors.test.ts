import { ApiError, apiClient } from '@appshore/web-core/shared/lib/api';

jest.mock('@appshore/web-core/auth/session-bridge', () => ({
  getSessionStore: () => ({ getState: () => ({ accessToken: 'token', signOut: jest.fn() }) }),
}));

const respond = (status: number, body: unknown) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
};

const failure = async () => {
  try {
    await apiClient('/things');
  } catch (error) {
    return error as ApiError;
  }
  throw new Error('expected the request to fail');
};

describe('apiClient reads the error envelope', () => {
  it('takes its message from `detail` and keeps the whole envelope on `data`', async () => {
    const envelope = {
      statusCode: 409,
      code: 'DUPLICATE',
      detail: 'A workspace with this name already exists',
      timestamp: '2026-11-12T00:00:00.000Z',
      path: '/api/v1/things',
      method: 'GET',
    };
    respond(409, envelope);
    const error = await failure();
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.message).toBe('A workspace with this name already exists');
    expect(error.data).toEqual(envelope);
  });

  it('does not fall back to a `message` key: the envelope has none', async () => {
    respond(400, { statusCode: 400, message: 'legacy copy' });
    expect((await failure()).message).toBe('Request failed');
  });

  it('a body that is not JSON (a proxy page) still fails with the status in its message', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    }) as unknown as typeof fetch;
    expect((await failure()).message).toBe('Request failed with status 502');
  });
});

import { ApiError, apiClient } from '@appshore/web-core/shared/lib/api';

jest.mock('@appshore/web-core/auth/session-bridge', () => ({
  getSessionStore: () => ({ getState: () => ({ accessToken: 'token', signOut: jest.fn() }) }),
}));

const REQUEST_ID = '0b9c6a4e-3f2d-4c1b-9a8e-7d6c5b4a3f21';

const respond = (status: number, headers: Record<string, string>) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status,
    headers: new Headers(headers),
    json: async () => ({ statusCode: status, code: 'INTERNAL', detail: 'Something went wrong' }),
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

describe('apiClient carries the backend request id on ApiError', () => {
  it('reads the x-request-id response header into ApiError.requestId', async () => {
    respond(500, { 'x-request-id': REQUEST_ID });
    expect((await failure()).requestId).toBe(REQUEST_ID);
  });

  it('ignores a header that is not a UUID (no free text rides into a Sentry tag)', async () => {
    respond(500, { 'x-request-id': 'not-an-id <script>' });
    expect((await failure()).requestId).toBeUndefined();
  });

  it('leaves requestId undefined when the response has no header', async () => {
    respond(404, {});
    expect((await failure()).requestId).toBeUndefined();
  });
});

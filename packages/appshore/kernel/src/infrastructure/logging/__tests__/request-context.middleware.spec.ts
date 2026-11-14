import type { NextFunction, Request, Response } from 'express';
import { RequestContextMiddleware, requestContextStorage, type RequestContext } from '../request-context.middleware';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Runs the middleware once and returns the response header, the context `next` saw, and the request. */
function run(incoming?: string | string[]) {
  const headers: Record<string, string | string[]> = {};
  if (incoming !== undefined) headers['x-request-id'] = incoming;
  const req = { headers } as unknown as Request & { setLogContext?: (patch: Partial<RequestContext>) => void };
  const setHeader = jest.fn();
  const res = { setHeader } as unknown as Response;
  let seen: RequestContext | undefined;
  const next: NextFunction = () => {
    seen = requestContextStorage.getStore();
  };
  new RequestContextMiddleware().use(req, res, next);
  const echoed = setHeader.mock.calls.find(([name]) => name === 'x-request-id')?.[1] as string | undefined;
  return { echoed, seen, req };
}

/**
 * The request id is the key that joins a log line, an error report and a client's bug report. A caller may bring its
 * own only as a UUID: anything else would let a client write arbitrary text into every log line of its request, or
 * pin its requests to someone else's id.
 */
describe('RequestContextMiddleware', () => {
  it('keeps an incoming x-request-id that is a UUID, and echoes it', () => {
    const id = '3f2a9c4e-8b1d-4e6f-a7c2-9d0e1f2a3b4c';
    const { echoed, seen } = run(id);
    expect(echoed).toBe(id);
    expect(seen?.requestId).toBe(id);
  });

  it.each([
    ['free text', 'hello world'],
    ['a log-injection attempt', 'abc\n{"level":"error","msg":"forged"}'],
    ['a UUID with a suffix', '3f2a9c4e-8b1d-4e6f-a7c2-9d0e1f2a3b4c-extra'],
    ['an empty header', ''],
  ])('replaces %s with a fresh UUID', (_label, incoming) => {
    const { echoed, seen } = run(incoming);
    expect(echoed).toMatch(UUID);
    expect(echoed).not.toBe(incoming);
    expect(seen?.requestId).toBe(echoed);
  });

  it('mints a UUID when the header is absent, and echoes it so the client can correlate', () => {
    const { echoed, seen } = run();
    expect(echoed).toMatch(UUID);
    expect(seen?.requestId).toBe(echoed);
  });

  it('lets the auth guards add the tenant and user to the same context later in the request', () => {
    const { req, seen } = run();
    req.setLogContext?.({ tenantId: 'acme', userId: 'u_1', role: 'ADMIN' });
    expect(seen).toMatchObject({ tenantId: 'acme', userId: 'u_1', role: 'ADMIN' });
  });
});

import 'reflect-metadata';
import { BadRequestException, ConflictException, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import type { AppCacheService } from '../cache/app-cache.service';
import { IdempotencyInterceptor, SkipIdempotency, idempotentCreateStatus } from './idempotency.interceptor';
import {
  IDEMPOTENCY_IN_FLIGHT_TTL_MS,
  IDEMPOTENCY_MAX_BODY_BYTES,
  IDEMPOTENCY_TTL_MS,
  IdempotencyStore,
  assertIdempotencyKey,
  canonicalJson,
  requestFingerprint,
} from './idempotency.store';

/** An in-memory AppCacheService with the TTLs it was asked for. */
function fakeCache() {
  const data = new Map<string, { value: unknown; ttl: number }>();
  const cache = {
    data,
    claim: jest.fn(async (key: string, value: unknown, ttl: number) => {
      if (data.has(key)) return false;
      data.set(key, { value: JSON.parse(JSON.stringify(value)), ttl });
      return true;
    }),
    get: jest.fn(async (key: string) => data.get(key)?.value),
    set: jest.fn(async (key: string, value: unknown, ttl: number) => void data.set(key, { value, ttl })),
    del: jest.fn(async (key: string) => void data.delete(key)),
  };
  return cache;
}

const conflictCode = async (promise: Promise<unknown>) => {
  const error: ConflictException = await promise.then(() => undefined).catch((e) => e);
  expect(error).toBeInstanceOf(ConflictException);
  return (error.getResponse() as { code: string }).code;
};

describe('IdempotencyStore', () => {
  const fp = requestFingerprint('POST /api/v1/things', { body: { title: 'A' } });

  it('runs the first request, remembers its success for 24h, and replays it', async () => {
    const cache = fakeCache();
    const store = new IdempotencyStore(cache as unknown as AppCacheService);
    const first = await store.claim('t1', 'key-1', fp);
    expect(first.kind).toBe('run');
    expect([...cache.data.values()][0].ttl).toBe(IDEMPOTENCY_IN_FLIGHT_TTL_MS);
    if (first.kind === 'run') await first.complete({ status: 201, body: { key: 'thing_1' } });
    expect([...cache.data.values()][0].ttl).toBe(IDEMPOTENCY_TTL_MS);

    await expect(store.claim('t1', 'key-1', fp)).resolves.toEqual({
      kind: 'replay',
      result: { status: 201, body: { key: 'thing_1' } },
    });
  });

  it('is per tenant: the same key in another workspace is a new request', async () => {
    const store = new IdempotencyStore(fakeCache() as unknown as AppCacheService);
    const first = await store.claim('t1', 'key-1', fp);
    if (first.kind === 'run') await first.complete({ status: 201, body: {} });
    await expect(store.claim('t2', 'key-1', fp)).resolves.toMatchObject({ kind: 'run' });
  });

  it('409 IDEMPOTENCY_KEY_REUSED for the same key on a different body or route', async () => {
    const store = new IdempotencyStore(fakeCache() as unknown as AppCacheService);
    const first = await store.claim('t1', 'k', fp);
    if (first.kind === 'run') await first.complete({ status: 201, body: {} });
    const otherBody = requestFingerprint('POST /api/v1/things', { body: { title: 'B' } });
    const otherRoute = requestFingerprint('POST /api/v1/widgets', { body: { title: 'A' } });
    expect(await conflictCode(store.claim('t1', 'k', otherBody))).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await conflictCode(store.claim('t1', 'k', otherRoute))).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('409 IDEMPOTENCY_KEY_IN_USE while the first attempt is still running', async () => {
    const store = new IdempotencyStore(fakeCache() as unknown as AppCacheService);
    await store.claim('t1', 'k', fp);
    expect(await conflictCode(store.claim('t1', 'k', fp))).toBe('IDEMPOTENCY_KEY_IN_USE');
  });

  it('a released (failed) attempt frees the key for a retry', async () => {
    const store = new IdempotencyStore(fakeCache() as unknown as AppCacheService);
    const first = await store.claim('t1', 'k', fp);
    if (first.kind === 'run') await first.release();
    await expect(store.claim('t1', 'k', fp)).resolves.toMatchObject({ kind: 'run' });
  });

  it('claims again once when the record expired between the claim and the read, then gives up', async () => {
    const cache = fakeCache();
    cache.claim.mockResolvedValueOnce(false);
    const store = new IdempotencyStore(cache as unknown as AppCacheService);
    await expect(store.claim('t1', 'k', fp)).resolves.toMatchObject({ kind: 'run' });
    cache.claim.mockResolvedValue(false);
    expect(await conflictCode(store.claim('t1', 'k2', fp))).toBe('IDEMPOTENCY_KEY_IN_USE');
  });

  it('refuses an unusable key with a 400 naming the header (or the tool argument)', () => {
    expect(() => assertIdempotencyKey('')).toThrow(BadRequestException);
    expect(() => assertIdempotencyKey('has space')).toThrow(BadRequestException);
    expect(() => assertIdempotencyKey('x'.repeat(256))).toThrow(BadRequestException);
    expect(() => assertIdempotencyKey('0b9a6f1e-1c2d-4e3f-8a9b-0c1d2e3f4a5b')).not.toThrow();
    try {
      assertIdempotencyKey('bad key', 'idempotencyKey');
    } catch (e) {
      expect((e as BadRequestException).getResponse()).toMatchObject({
        fieldErrors: { idempotencyKey: expect.any(String) },
      });
    }
  });

  it('hashes requests canonically: key order and undefined fields do not matter', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: undefined }], e: null })).toBe('{"a":[{"d":2}],"b":1,"e":null}');
    expect(requestFingerprint('x', { a: 1, b: 2 }).hash).toBe(requestFingerprint('x', { b: 2, a: 1 }).hash);
    expect(canonicalJson(undefined)).toBe('null');
  });
});

@Controller('things')
class ThingsController {
  @Post()
  create() {}

  @Post('queued')
  @HttpCode(HttpStatus.ACCEPTED)
  queue() {}

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  start() {}

  @Post('raw')
  raw(@Res() _res: unknown) {}

  @Post('secret')
  @HttpCode(HttpStatus.CREATED)
  @SkipIdempotency()
  mintSecret() {}

  @Post('passthrough')
  @HttpCode(HttpStatus.CREATED)
  passthrough(@Res({ passthrough: true }) _res: unknown) {}
}

describe('IdempotencyInterceptor', () => {
  const proto = ThingsController.prototype;

  it('covers creates (201) and queued creates (202), never actions, raw responses or non-POSTs', () => {
    expect(idempotentCreateStatus('POST', ThingsController, proto.create)).toBe(201);
    expect(idempotentCreateStatus('post', ThingsController, proto.queue)).toBe(202);
    expect(idempotentCreateStatus('POST', ThingsController, proto.passthrough)).toBe(201);
    expect(idempotentCreateStatus('POST', ThingsController, proto.start)).toBeNull();
    expect(idempotentCreateStatus('POST', ThingsController, proto.raw)).toBeNull();
    expect(idempotentCreateStatus('GET', ThingsController, proto.create)).toBeNull();
    expect(idempotentCreateStatus('POST', ThingsController, proto.mintSecret)).toBeNull();
  });

  function http(opts: {
    key?: string;
    tenantId?: string;
    userId?: string;
    handler?: object;
    body?: unknown;
    type?: string;
    multipart?: boolean;
  }) {
    const headers: Record<string, string> = {};
    const res = { statusCode: 201, setHeader: (k: string, v: string) => (headers[k] = v), status: jest.fn() };
    const req = {
      method: 'POST',
      path: '/api/v1/things',
      body: opts.body ?? { title: 'A' },
      query: {},
      user: opts.tenantId ? { tenantId: opts.tenantId, userId: opts.userId ?? 'user_1' } : undefined,
      header: (name: string) => (name === 'Idempotency-Key' ? opts.key : undefined),
      is: (type: string) => (opts.multipart && type === 'multipart/form-data' ? type : false),
    };
    const context = {
      getType: () => opts.type ?? 'http',
      getClass: () => ThingsController,
      getHandler: () => opts.handler ?? proto.create,
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as never;
    return { context, headers, res };
  }

  it('replays the first response: the handler runs once, the second answer is identical and marked', async () => {
    const interceptor = new IdempotencyInterceptor(new IdempotencyStore(fakeCache() as unknown as AppCacheService));
    const handle = jest.fn(() => of({ key: 'thing_7' }));
    const one = http({ key: 'k1', tenantId: 't1' });
    await expect(lastValueFrom(interceptor.intercept(one.context, { handle }))).resolves.toEqual({ key: 'thing_7' });
    const two = http({ key: 'k1', tenantId: 't1' });
    await expect(lastValueFrom(interceptor.intercept(two.context, { handle }))).resolves.toEqual({ key: 'thing_7' });
    expect(handle).toHaveBeenCalledTimes(1);
    expect(two.headers['Idempotent-Replayed']).toBe('true');
    expect(two.res.status).toHaveBeenCalledWith(201);
    expect(one.headers).toEqual({});
  });

  it('a different body under the same key is a 409', async () => {
    const interceptor = new IdempotencyInterceptor(new IdempotencyStore(fakeCache() as unknown as AppCacheService));
    await lastValueFrom(interceptor.intercept(http({ key: 'k1', tenantId: 't1' }).context, { handle: () => of({}) }));
    const changed = http({ key: 'k1', tenantId: 't1', body: { title: 'B' } });
    await expect(
      lastValueFrom(interceptor.intercept(changed.context, { handle: () => of({}) })),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('a failure is not remembered — the retry runs the handler again', async () => {
    const interceptor = new IdempotencyInterceptor(new IdempotencyStore(fakeCache() as unknown as AppCacheService));
    const boom = new BadRequestException('nope');
    await expect(
      lastValueFrom(
        interceptor.intercept(http({ key: 'k1', tenantId: 't1' }).context, { handle: () => throwError(() => boom) }),
      ),
    ).rejects.toBe(boom);
    const handle = jest.fn(() => of({ ok: 1 }));
    await expect(
      lastValueFrom(interceptor.intercept(http({ key: 'k1', tenantId: 't1' }).context, { handle })),
    ).resolves.toEqual({
      ok: 1,
    });
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('passes through without a key, without a tenant, on a non-create route and outside HTTP', async () => {
    const cache = fakeCache();
    const interceptor = new IdempotencyInterceptor(new IdempotencyStore(cache as unknown as AppCacheService));
    for (const opts of [
      { tenantId: 't1' },
      { key: 'k', tenantId: undefined },
      { key: 'k', tenantId: 't1', handler: proto.start },
      { key: 'k', tenantId: 't1', type: 'rpc' },
      { key: 'k', tenantId: 't1', multipart: true },
      { key: 'k', tenantId: 't1', handler: proto.mintSecret },
    ]) {
      await lastValueFrom(interceptor.intercept(http(opts).context, { handle: () => of(1) }));
    }
    expect(cache.claim).not.toHaveBeenCalled();
  });

  it('a replay is for the same person only: a colleague in the tenant with the same key runs anew', async () => {
    const interceptor = new IdempotencyInterceptor(new IdempotencyStore(fakeCache() as unknown as AppCacheService));
    const handle = jest.fn(() => of({ secret: 'mine' }));
    await lastValueFrom(interceptor.intercept(http({ key: 'k1', tenantId: 't1', userId: 'a' }).context, { handle }));
    await lastValueFrom(interceptor.intercept(http({ key: 'k1', tenantId: 't1', userId: 'b' }).context, { handle }));
    expect(handle).toHaveBeenCalledTimes(2);
  });

  it('fails open: an unreachable store runs the request without the key; a store 4xx still stands', async () => {
    const down = { claim: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    const interceptor = new IdempotencyInterceptor(down as unknown as IdempotencyStore);
    const handle = jest.fn(() => of({ ok: 1 }));
    await expect(
      lastValueFrom(interceptor.intercept(http({ key: 'k', tenantId: 't1' }).context, { handle })),
    ).resolves.toEqual({ ok: 1 });
    const conflict = { claim: jest.fn().mockRejectedValue(new ConflictException('reused')) };
    await expect(
      lastValueFrom(
        new IdempotencyInterceptor(conflict as never).intercept(http({ key: 'k', tenantId: 't1' }).context, { handle }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('fails open on a store that never answers', async () => {
    jest.useFakeTimers();
    try {
      const hung = { claim: jest.fn(() => new Promise(() => undefined)) };
      const interceptor = new IdempotencyInterceptor(hung as unknown as IdempotencyStore);
      const result = lastValueFrom(
        interceptor.intercept(http({ key: 'k', tenantId: 't1' }).context, { handle: () => of(7) }),
      );
      await jest.advanceTimersByTimeAsync(2500);
      await expect(result).resolves.toBe(7);
    } finally {
      jest.useRealTimers();
    }
  });

  it('a queued create (202) replays at 202', async () => {
    const interceptor = new IdempotencyInterceptor(new IdempotencyStore(fakeCache() as unknown as AppCacheService));
    const handle = jest.fn(() => of({ jobId: 'job_1' }));
    await lastValueFrom(
      interceptor.intercept(http({ key: 'q', tenantId: 't1', handler: proto.queue }).context, { handle }),
    );
    const again = http({ key: 'q', tenantId: 't1', handler: proto.queue });
    await expect(lastValueFrom(interceptor.intercept(again.context, { handle }))).resolves.toEqual({ jobId: 'job_1' });
    expect(handle).toHaveBeenCalledTimes(1);
    expect(again.res.status).toHaveBeenCalledWith(202);
  });

  it('an unusable key is a 400 naming the header, and the handler never runs', async () => {
    const interceptor = new IdempotencyInterceptor(new IdempotencyStore(fakeCache() as unknown as AppCacheService));
    const handle = jest.fn(() => of({}));
    const error = await lastValueFrom(
      interceptor.intercept(http({ key: 'has space', tenantId: 't1' }).context, { handle }),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      fieldErrors: { 'Idempotency-Key': expect.any(String) },
    });
    expect(handle).not.toHaveBeenCalled();
  });

  it('a create that happened is answered even when remembering it fails', async () => {
    const store = {
      claim: jest.fn().mockResolvedValue({
        kind: 'run',
        complete: jest.fn().mockRejectedValue(new Error('redis gone')),
        release: jest.fn(),
      }),
    };
    const interceptor = new IdempotencyInterceptor(store as unknown as IdempotencyStore);
    await expect(
      lastValueFrom(
        interceptor.intercept(http({ key: 'k', tenantId: 't1' }).context, { handle: () => of({ key: 'thing_9' }) }),
      ),
    ).resolves.toEqual({ key: 'thing_9' });
  });
});

describe('IdempotencyStore ownership and size', () => {
  const fp = requestFingerprint('POST /x', { body: 1 });

  it('a stale attempt never completes or releases a claim a later retry took over', async () => {
    const cache = fakeCache();
    const store = new IdempotencyStore(cache as unknown as AppCacheService);
    const first = await store.claim('s', 'k', fp);
    cache.data.clear(); // the first claim expired
    const second = await store.claim('s', 'k', fp);
    if (first.kind === 'run') {
      await first.complete({ status: 201, body: { stale: true } });
      await first.release();
    }
    expect([...cache.data.values()][0].value).toMatchObject({ state: 'pending' });
    if (second.kind === 'run') await second.complete({ status: 201, body: { fresh: true } });
    await expect(store.claim('s', 'k', fp)).resolves.toMatchObject({
      kind: 'replay',
      result: { body: { fresh: true } },
    });
  });

  it('a body over the size cap is not remembered — the key is released', async () => {
    const cache = fakeCache();
    const store = new IdempotencyStore(cache as unknown as AppCacheService);
    const claim = await store.claim('s', 'k', fp);
    if (claim.kind === 'run') await claim.complete({ status: 201, body: 'x'.repeat(IDEMPOTENCY_MAX_BODY_BYTES + 1) });
    expect(cache.data.size).toBe(0);
  });
});

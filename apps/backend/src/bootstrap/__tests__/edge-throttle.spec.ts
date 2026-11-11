import { Controller, Get, Global, INestApplication, Module, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AppCacheService } from '@appshore/platform/infrastructure/cache/app-cache.service';
import { edgeThrottlerOptions } from '../edge-throttle';
import { applyTrustProxy } from '../trust-proxy';

const SESSION_SECRET = 'edge-throttle-spec-session-secret-0123456789';

@Controller()
class ProbeController {
  @Get('things')
  things() {
    return { ok: true };
  }

  @Post('login')
  @Throttle({ default: { limit: 1, ttl: 60_000 } })
  login() {
    return { ok: true };
  }
}

/** Stands in for Redis: the same counting the Lua script does, shared by whoever holds this object. */
class FakeRedisCounts {
  private readonly hits = new Map<string, number>();
  down = false;
  keys = () => [...this.hits.keys()];

  throttleHit = jest.fn(async (key: string, ttlMs: number, limit: number, blockMs: number) => {
    if (this.down) throw new Error('ECONNREFUSED');
    const totalHits = (this.hits.get(key) ?? 0) + 1;
    this.hits.set(key, totalHits);
    const isBlocked = totalHits > limit;
    return { totalHits, windowMs: ttlMs, isBlocked, blockLeftMs: isBlocked ? blockMs : 0 };
  });
}

async function createApp(cache: FakeRedisCounts, settings: Record<string, unknown>): Promise<INestApplication> {
  const config = {
    get: (key: string) => settings[key],
    getOrThrow: (key: string) => {
      if (settings[key] === undefined) throw new Error(`missing ${key}`);
      return settings[key];
    },
  };

  // Global, like the app's ConfigModule and CacheModule.
  @Global()
  @Module({
    providers: [
      { provide: AppCacheService, useValue: cache },
      { provide: ConfigService, useValue: config },
    ],
    exports: [AppCacheService, ConfigService],
  })
  class FakeInfraModule {}

  @Module({
    imports: [
      FakeInfraModule,
      ThrottlerModule.forRootAsync({
        inject: [ConfigService, AppCacheService],
        useFactory: edgeThrottlerOptions,
      }),
    ],
    controllers: [ProbeController],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  })
  class ProbeModule {}

  const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
  const app = moduleRef.createNestApplication();
  applyTrustProxy(app.getHttpAdapter().getInstance(), '1', 'production');
  await app.init();
  return app;
}

describe('edge throttle (real ThrottlerGuard over HTTP)', () => {
  const settings = {
    'edge.throttleLimit': 2,
    'edge.throttleTtlMs': 60_000,
    'jwt.accessSecret': SESSION_SECRET,
    secretKey: 'edge-throttle-spec-secret-key-0123456789',
    oauthIssuer: 'https://api.acme.io',
  };
  const sessionFor = (sub: string) => `Bearer ${new JwtService().sign({ sub }, { secret: SESSION_SECRET })}`;

  let cache: FakeRedisCounts;
  let app: INestApplication;

  beforeEach(async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    cache = new FakeRedisCounts();
    app = await createApp(cache, settings);
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  const get = (headers: Record<string, string> = {}) => request(app.getHttpServer()).get('/things').set(headers);

  it('takes the limit from config and answers 429 past it', async () => {
    const from = { 'X-Forwarded-For': '203.0.113.7' };
    expect((await get(from)).status).toBe(200);
    expect((await get(from)).status).toBe(200);
    expect((await get(from)).status).toBe(429);
  });

  it('counts through the shared store, so a second replica sees the same count', async () => {
    const replica = await createApp(cache, settings);
    const from = { 'X-Forwarded-For': '203.0.113.7' };
    try {
      expect((await get(from)).status).toBe(200);
      expect((await request(replica.getHttpServer()).get('/things').set(from)).status).toBe(200);
      expect((await get(from)).status).toBe(429);
    } finally {
      await replica.close();
    }
    expect(cache.throttleHit).toHaveBeenCalledTimes(3);
    expect(cache.keys()).toHaveLength(1);
    expect(cache.keys()[0]).toMatch(/^app:throttle:default:/);
  });

  it('counts each client IP behind the load balancer separately', async () => {
    await get({ 'X-Forwarded-For': '203.0.113.7' });
    await get({ 'X-Forwarded-For': '203.0.113.7' });
    expect((await get({ 'X-Forwarded-For': '203.0.113.7' })).status).toBe(429);
    expect((await get({ 'X-Forwarded-For': '198.51.100.20' })).status).toBe(200);
  });

  it('counts a signed-in user as one principal across IPs, and two users on one IP separately', async () => {
    const alice = sessionFor('user-alice');
    expect((await get({ Authorization: alice, 'X-Forwarded-For': '203.0.113.7' })).status).toBe(200);
    expect((await get({ Authorization: alice, 'X-Forwarded-For': '198.51.100.20' })).status).toBe(200);
    expect((await get({ Authorization: alice, 'X-Forwarded-For': '192.0.2.44' })).status).toBe(429);

    expect((await get({ Authorization: sessionFor('user-bob'), 'X-Forwarded-For': '203.0.113.7' })).status).toBe(200);
  });

  it('a changing forged bearer does not buy a fresh bucket: it is counted against the IP', async () => {
    const from = (bearer: string) => ({ Authorization: `Bearer ${bearer}`, 'X-Forwarded-For': '203.0.113.7' });
    expect((await get(from('sk_live_guess_1'))).status).toBe(200);
    expect((await get(from('aaa.bbb.ccc'))).status).toBe(200);
    expect((await get(from('sk_live_guess_3'))).status).toBe(429);
  });

  it('keeps a per-route @Throttle override', async () => {
    const post = () => request(app.getHttpServer()).post('/login').set('X-Forwarded-For', '203.0.113.7');
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(429);
  });

  it('when Redis is down the limit still holds on this instance and no request errors', async () => {
    cache.down = true;
    const from = { 'X-Forwarded-For': '203.0.113.7' };

    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await get(from)).status);

    expect(statuses).toEqual([200, 200, 429, 429]);
    expect((await get({ 'X-Forwarded-For': '198.51.100.20' })).status).toBe(200);
  });
});

import { Controller, Get, Global, INestApplication, Module, Post, UseGuards } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { Public } from '@appshore/platform/auth/decorators/public.decorator';
import { AppCacheService } from '@appshore/platform/infrastructure/cache/app-cache.service';
import { OAuthProviderService } from '@appshore/platform/domains/oauth-provider/oauth-provider.service';
import { OAuthTokenGuard } from '@appshore/platform/domains/oauth-provider/oauth-token.guard';
import { edgeThrottlerOptions } from '../edge-throttle';
import { applyTrustProxy } from '../trust-proxy';

const SESSION_SECRET = 'edge-throttle-spec-session-secret-0123456789';
const SECRET_KEY = 'edge-throttle-spec-secret-key-0123456789';
const ISSUER = 'https://api.acme.io';

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

  @Public()
  @Post('public-login')
  @Throttle({ default: { limit: 1, ttl: 60_000 } })
  publicLogin() {
    return { ok: true };
  }

  // Wired like POST /mcp: public to the session guard, authenticated by the OAuth guard.
  @Public()
  @Post('agent')
  @UseGuards(OAuthTokenGuard)
  agent() {
    return { ok: true };
  }
}

// The same, with the guard on the controller instead of the handler.
@Public()
@Controller('agent-class')
@UseGuards(OAuthTokenGuard)
class ClassGuardedController {
  @Post()
  agent() {
    return { ok: true };
  }
}

/** The real service checks the signature, the issuer and the stored grant; the signature and issuer are enough here. */
const fakeOAuthService = {
  validateAccessToken: (token: string) => {
    try {
      return Promise.resolve(
        new JwtService().verify<Record<string, unknown>>(token, { secret: `${SECRET_KEY}-oauth`, issuer: ISSUER }),
      );
    } catch {
      return Promise.resolve(null);
    }
  },
};

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
    controllers: [ProbeController, ClassGuardedController],
    providers: [
      { provide: APP_GUARD, useClass: ThrottlerGuard },
      { provide: OAuthProviderService, useValue: fakeOAuthService },
      OAuthTokenGuard,
    ],
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
    secretKey: SECRET_KEY,
    oauthIssuer: ISSUER,
  };
  const oauthFor = (clientId: string, sub: string) =>
    `Bearer ${new JwtService().sign({ sub, clientId, tenantId: 1, role: 'MEMBER', scopes: [] }, { secret: `${SECRET_KEY}-oauth`, issuer: ISSUER })}`;
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

  it('a @Public route is counted by IP whatever session is attached: more accounts do not buy more guesses', async () => {
    const post = (headers: Record<string, string>) =>
      request(app.getHttpServer())
        .post('/public-login')
        .set({ 'X-Forwarded-For': '203.0.113.7', ...headers });

    expect((await post({ Authorization: sessionFor('user-alice') })).status).toBe(201);
    expect((await post({ Authorization: sessionFor('user-bob') })).status).toBe(429);
    expect((await post({})).status).toBe(429);
  });

  it.each([['/agent'], ['/agent-class']])(
    'a @Public route behind the OAuth guard (%s) counts each OAuth client + user separately on one IP',
    async (path) => {
      const post = (headers: Record<string, string>) =>
        request(app.getHttpServer())
          .post(path)
          .set({ 'X-Forwarded-For': '203.0.113.7', ...headers });
      const alice = { Authorization: oauthFor('app_x', '1') };

      expect((await post(alice)).status).toBe(201);
      expect((await post(alice)).status).toBe(201);
      expect((await post(alice)).status).toBe(429);

      // Same IP: another user of the same client, and the same user through another client, have their own window.
      expect((await post({ Authorization: oauthFor('app_x', '2') })).status).toBe(201);
      expect((await post({ Authorization: oauthFor('app_y', '1') })).status).toBe(201);
      // The OAuth calls did not use up the IP's window: a call with no bearer reaches the guard and gets its 401.
      expect((await post({})).status).toBe(401);
      // The principal follows the token, not the IP.
      expect((await post({ ...alice, 'X-Forwarded-For': '198.51.100.20' })).status).toBe(429);
    },
  );

  it('on that route a session or a forged bearer is still counted by IP', async () => {
    const post = (authorization: string) =>
      request(app.getHttpServer())
        .post('/agent')
        .set({ 'X-Forwarded-For': '203.0.113.7', Authorization: authorization });
    const forged = new JwtService().sign({ sub: '1', clientId: 'app_x' }, { secret: 'attacker', issuer: ISSUER });

    expect((await post(sessionFor('user-alice'))).status).toBe(401);
    expect((await post(`Bearer ${forged}`)).status).toBe(401);
    expect((await post(sessionFor('user-bob'))).status).toBe(429);
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

describe('app.module.ts wiring', () => {
  const appModule = readFileSync(join(__dirname, '..', '..', 'app.module.ts'), 'utf8');

  it('registers the throttler through edgeThrottlerOptions (Redis count, per principal), not the in-memory default', () => {
    expect(appModule).toMatch(
      /ThrottlerModule\.forRootAsync\(\{\s*inject: \[ConfigService, AppCacheService\],\s*useFactory: edgeThrottlerOptions,\s*\}\)/,
    );
    expect(appModule).not.toMatch(/ThrottlerModule\.forRoot\(/);
  });

  it('keeps the ThrottlerGuard global', () => {
    expect(appModule).toMatch(/provide: APP_GUARD,\s*useClass: ThrottlerGuard/);
  });
});

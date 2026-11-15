import { Controller, Get, INestApplication, Injectable, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ExtractJwt, Strategy } from 'passport-jwt';
import request from 'supertest';
import { JwtAuthGuard } from '@appshore/platform/auth/guards/jwt-auth.guard';
import { Public } from '@appshore/platform/auth/decorators/public.decorator';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { RlsScopeInterceptor } from '@appshore/platform/infrastructure/rls/rls-scope.interceptor';
import { RequestContextMiddleware } from '@appshore/kernel/infrastructure/logging/request-context.middleware';
import { logContextMixin } from '@appshore/kernel/infrastructure/logging/log-context-mixin';
import { currentRls } from '@appshore/kernel/infrastructure/rls/rls-context';
import { RlsContextMiddleware } from '@appshore/kernel/infrastructure/rls/rls-context.middleware';
import { SystemScope } from '@appshore/kernel/infrastructure/rls/system-scope.decorator';

/**
 * End to end through the real middleware chain, the global JwtAuthGuard and the global RlsScopeInterceptor, wired as
 * app.module.ts wires them: the tenant pinned during passport's async `validate` is still visible inside the route
 * handler and on its log fields, concurrent requests stay isolated, and a `@SystemScope` route runs as system work.
 */

const SECRET = 'rls-http-spec-secret';
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

@Injectable()
class TestJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: SECRET });
  }

  // An async hop, like the real JwtStrategy's database lookup.
  async validate(payload: { sub: string; tenantDbId?: number }) {
    await tick();
    return { id: 1, userId: payload.sub, tenantId: 'acme-co', tenantDbId: payload.tenantDbId };
  }
}

@Controller('rls-probe')
class RlsProbeController {
  @Get()
  async probe() {
    await tick();
    return { rls: currentRls() ?? null, log: logContextMixin() };
  }

  @Public()
  @Get('public')
  publicProbe() {
    return { rls: currentRls() ?? null, log: logContextMixin() };
  }

  @SystemScope('super-admin')
  @Get('system')
  async systemProbe() {
    await tick();
    return { rls: currentRls() ?? null };
  }
}

@Module({
  imports: [PassportModule],
  controllers: [RlsProbeController],
  providers: [
    TestJwtStrategy,
    { provide: PrismaService, useValue: {} },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: RlsScopeInterceptor },
  ],
})
class RlsProbeModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware, RlsContextMiddleware).forRoutes('*');
  }
}

describe('Tenant context over HTTP (middleware, JwtAuthGuard, RlsScopeInterceptor)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const jwt = new JwtService({ secret: SECRET });
  const tokenFor = (tenantDbId?: number) => jwt.sign({ sub: 'user-1', ...(tenantDbId ? { tenantDbId } : {}) });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [RlsProbeModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    // A real listening socket: supertest's per-call ephemeral listen resets connections under concurrent requests.
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes the JWT tenant to the route handler and its log lines', async () => {
    const res = await request(baseUrl)
      .get('/rls-probe')
      .set('Authorization', `Bearer ${tokenFor(42)}`)
      .expect(200);

    expect(res.body.rls).toEqual({ kind: 'tenant', tenantId: 42, source: 'jwt' });
    expect(res.body.log).toMatchObject({ 'rls.kind': 'tenant', 'rls.tenant': '42', 'rls.source': 'jwt' });
  });

  it('leaves a tenantless session (SUPER_ADMIN) with no context', async () => {
    const res = await request(baseUrl).get('/rls-probe').set('Authorization', `Bearer ${tokenFor()}`).expect(200);
    expect(res.body.rls).toBeNull();
  });

  it('leaves a public route with no context, logged as rls.kind=none', async () => {
    const res = await request(baseUrl).get('/rls-probe/public').expect(200);
    expect(res.body.rls).toBeNull();
    expect(res.body.log).toMatchObject({ 'rls.kind': 'none' });
  });

  it('runs a @SystemScope route as declared system work', async () => {
    const res = await request(baseUrl)
      .get('/rls-probe/system')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .expect(200);
    expect(res.body.rls).toEqual({ kind: 'system', reason: 'super-admin' });
  });

  it('keeps concurrent requests for different tenants isolated', async () => {
    const tenants = [1, 2, 3, 4, 5, 6];
    const responses = await Promise.all(
      tenants.map((t) =>
        request(baseUrl)
          .get('/rls-probe')
          .set('Authorization', `Bearer ${tokenFor(t)}`)
          .expect(200),
      ),
    );

    expect(responses.map((r) => r.body.rls.tenantId)).toEqual(tenants);
  });
});

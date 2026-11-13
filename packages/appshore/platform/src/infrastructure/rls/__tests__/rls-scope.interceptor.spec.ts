import { Controller, Get, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, Observable } from 'rxjs';

import { currentRls, runAsTenant } from '@appshore/kernel/infrastructure/rls/rls-context';
import { SystemScope, TargetTenant } from '@appshore/kernel/infrastructure/rls/system-scope.decorator';
import { registerSystemReasons } from '@appshore/kernel/infrastructure/rls/system-reasons';
import type { PrismaService } from '../../database/prisma.service';
import { RlsScopeInterceptor } from '../rls-scope.interceptor';

// An app reason, registered the way a product registers its own.
registerSystemReasons(['admin.ai-spend']);

@SystemScope('super-admin')
@Controller('x')
class SystemController {
  @Get() list() {}
  @TargetTenant('tenantId') @Get(':tenantId') one() {}
  @TargetTenant('slug', 'slug') @Get('s/:slug') bySlug() {}
}

@Controller('y')
class PlainController {
  @Get() list() {}
  @SystemScope('admin.ai-spend') @Get('spend') spend() {}
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function ctx(
  handler: (...args: unknown[]) => unknown,
  cls: object,
  params: Record<string, string> = {},
  originalUrl = '/x',
) {
  const req = { method: 'GET', originalUrl, params, user: { userId: 'user_sa' } };
  return {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

/** A handler that awaits before reading the scope, like a real async route. */
const handlerReadingScope: CallHandler = {
  handle: () =>
    new Observable((sub) => {
      void (async () => {
        await tick();
        sub.next(currentRls());
        sub.complete();
      })();
    }),
};

describe('RlsScopeInterceptor', () => {
  const findUnique = jest.fn();
  const prisma = { tenant: { findUnique } };
  const interceptor = new RlsScopeInterceptor(new Reflector(), prisma as unknown as PrismaService);
  let log: jest.SpyInstance;

  beforeEach(() => {
    findUnique.mockReset();
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  const run = (c: ExecutionContext) => firstValueFrom(interceptor.intercept(c, handlerReadingScope));

  it('leaves routes without either decorator untouched', async () => {
    expect(await run(ctx(PlainController.prototype.list, PlainController))).toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  });

  it('runs a class-level @SystemScope route in a system scope and logs reason + user id', async () => {
    expect(await run(ctx(SystemController.prototype.list, SystemController))).toEqual({
      kind: 'system',
      reason: 'super-admin',
    });
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/reason=super-admin user=user_sa GET \/x/));
  });

  it('logs the path without its query string', async () => {
    await run(ctx(SystemController.prototype.list, SystemController, {}, '/x?token=secret'));
    expect(log).toHaveBeenCalledWith(expect.not.stringContaining('secret'));
  });

  it('honours a method-level @SystemScope', async () => {
    expect(await run(ctx(PlainController.prototype.spend, PlainController))).toMatchObject({
      kind: 'system',
      reason: 'admin.ai-spend',
    });
  });

  it('runs a @TargetTenant route as the tenant in the URL, overriding the class system scope', async () => {
    expect(await run(ctx(SystemController.prototype.one, SystemController, { tenantId: '42' }))).toEqual({
      kind: 'tenant',
      tenantId: 42,
      source: 'super-admin',
    });
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/acting as tenant 42 user=user_sa/));
  });

  it('resolves a slug target to its numeric id', async () => {
    findUnique.mockResolvedValue({ id: 5 });
    const seen = await run(ctx(SystemController.prototype.bySlug, SystemController, { slug: 'acme' }));
    expect(findUnique).toHaveBeenCalledWith({ where: { tenantId: 'acme' }, select: { id: true } });
    expect(seen).toMatchObject({ kind: 'tenant', tenantId: 5 });
  });

  it('runs unscoped when the target tenant is malformed or unknown (the handler answers 400/404)', async () => {
    expect(await run(ctx(SystemController.prototype.one, SystemController, { tenantId: 'abc' }))).toBeUndefined();
    findUnique.mockResolvedValue(null);
    expect(await run(ctx(SystemController.prototype.bySlug, SystemController, { slug: 'nope' }))).toBeUndefined();
  });

  it('propagates handler errors', async () => {
    const failing: CallHandler = { handle: () => new Observable((sub) => sub.error(new Error('boom'))) };
    await expect(
      firstValueFrom(interceptor.intercept(ctx(SystemController.prototype.list, SystemController), failing)),
    ).rejects.toThrow('boom');
  });

  it('fails the request when a system scope is opened inside a tenant scope', async () => {
    await expect(
      runAsTenant(3, 'jwt', () => run(ctx(SystemController.prototype.list, SystemController))),
    ).rejects.toThrow(/system scope/);
  });
});

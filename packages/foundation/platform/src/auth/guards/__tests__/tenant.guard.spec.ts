import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TenantGuard } from '../tenant.guard';

describe('TenantGuard', () => {
  let guard: TenantGuard;
  let reflector: Reflector;
  let configGet: jest.Mock;

  const createMockContext = (user?: Record<string, any>, isPublic = false) => {
    const request: Record<string, any> = { user };
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => () => {},
      getClass: () => class TestController {},
    } as unknown as ExecutionContext;
    // Wire up reflector return
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(isPublic ? true : undefined);
    return { ctx, request };
  };

  beforeEach(async () => {
    configGet = jest.fn().mockReturnValue({ enabled: true, implicitTenantId: 1 });

    const module = await Test.createTestingModule({
      providers: [
        TenantGuard,
        {
          provide: Reflector,
          useValue: { getAllAndOverride: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: configGet },
        },
      ],
    }).compile();

    guard = module.get(TenantGuard);
    reflector = module.get(Reflector);
  });

  it('should allow public routes', () => {
    const { ctx } = createMockContext(undefined, true);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow SUPER_ADMIN without tenantId', () => {
    const { ctx } = createMockContext({ role: 'SUPER_ADMIN' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw UnauthorizedException when tenantId is missing for regular user', () => {
    const { ctx } = createMockContext({ role: 'MEMBER' });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx)).toThrow('Tenant context missing');
  });

  it('should throw UnauthorizedException when user is null', () => {
    const { ctx } = createMockContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should allow a regular user with valid tenantId', () => {
    const { ctx } = createMockContext({
      role: 'MEMBER',
      tenantId: 'tnt-001',
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should not mutate the request — tenant scoping is read from @CurrentUser()', () => {
    const { ctx, request } = createMockContext({
      role: 'ADMIN',
      tenantId: 'tnt-002',
    });

    guard.canActivate(ctx);
    expect(request.tenantId).toBeUndefined();
  });

  it('should short-circuit when multi-tenancy is disabled', () => {
    configGet.mockReturnValue({ enabled: false, implicitTenantId: 1 });
    // No tenant claim on the user, and not SUPER_ADMIN — would normally throw.
    const { ctx } = createMockContext({ role: 'MEMBER' });

    expect(guard.canActivate(ctx)).toBe(true);
  });
});

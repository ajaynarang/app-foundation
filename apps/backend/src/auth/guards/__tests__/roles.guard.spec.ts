import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { RolesGuard } from '../roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const createMockContext = (user?: Record<string, any>) => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => () => {},
      getClass: () => class TestController {},
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: { getAllAndOverride: jest.fn() },
        },
      ],
    }).compile();

    guard = module.get(RolesGuard);
    reflector = module.get(Reflector);
  });

  it('should allow when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = createMockContext({ role: 'MEMBER' });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow when user has a required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['MEMBER', 'ADMIN']);
    const ctx = createMockContext({ role: 'MEMBER' });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should deny when user lacks the required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    const ctx = createMockContext({ role: 'MEMBER' });

    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('should handle multiple required roles (user matches one)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['MEMBER', 'ADMIN', 'SUPER_ADMIN']);
    const ctx = createMockContext({ role: 'SUPER_ADMIN' });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should deny when user matches none of multiple required roles', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN', 'OWNER']);
    const ctx = createMockContext({ role: 'MEMBER' });

    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('should throw when user object is missing and roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    const ctx = createMockContext(undefined);

    // user is undefined, accessing user.role throws TypeError
    expect(() => guard.canActivate(ctx)).toThrow();
  });
});

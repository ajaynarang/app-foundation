import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../jwt-auth.guard';

// Mock AuthGuard factory from @nestjs/passport
const mockSuperCanActivate = jest.fn().mockReturnValue(true);
const mockSuperHandleRequest = jest.fn().mockImplementation((_err, user) => user);

jest.mock('@nestjs/passport', () => ({
  AuthGuard: () => {
    class MockAuthGuard {
      canActivate(...args: any[]) {
        return mockSuperCanActivate(...args);
      }
      handleRequest(...args: any[]) {
        return mockSuperHandleRequest(...args);
      }
    }
    return MockAuthGuard;
  },
}));

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  const createMockContext = (overrides: Record<string, any> = {}) => {
    const request = {
      url: '/api/loads',
      setLogContext: jest.fn(),
      ...overrides.request,
    };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => overrides.handler ?? (() => {}),
      getClass: () => overrides.controller ?? class TestController {},
      getType: () => overrides.type ?? 'http',
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        {
          provide: Reflector,
          useValue: { getAllAndOverride: jest.fn() },
        },
      ],
    }).compile();

    guard = module.get(JwtAuthGuard);
    reflector = module.get(Reflector);
  });

  describe('canActivate', () => {
    it('should allow access when route is marked @Public()', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
      const ctx = createMockContext();

      const result = guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(mockSuperCanActivate).not.toHaveBeenCalled();
    });

    it('should call super.canActivate() for non-public routes', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      const ctx = createMockContext();

      guard.canActivate(ctx);

      expect(mockSuperCanActivate).toHaveBeenCalledWith(ctx);
    });

    it('should treat undefined metadata as non-public', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
      const ctx = createMockContext();

      guard.canActivate(ctx);

      expect(mockSuperCanActivate).toHaveBeenCalledWith(ctx);
    });
  });

  describe('handleRequest', () => {
    it('should set log context for authenticated HTTP requests', () => {
      const setLogContext = jest.fn();
      const user = { id: 1, tenantId: 'tnt-1' } as any;
      const ctx = createMockContext({
        request: { setLogContext, url: '/test' },
      });

      // handleRequest calls super.handleRequest which returns user,
      // then enriches log context
      mockSuperHandleRequest.mockReturnValue(user);
      const result = guard.handleRequest(null, user, null, ctx);

      expect(result).toEqual(user);
      // super.handleRequest returns what we told it to, guard then sets log context
      expect(setLogContext).toHaveBeenCalledWith({
        tenantId: 'tnt-1',
        userId: '1',
      });
    });

    it('should not set log context when super returns falsy user', () => {
      const setLogContext = jest.fn();
      const ctx = createMockContext({
        request: { setLogContext, url: '/test' },
      });

      mockSuperHandleRequest.mockReturnValue(null);
      guard.handleRequest(null, null as any, null, ctx);

      expect(setLogContext).not.toHaveBeenCalled();
    });

    it('should not set log context for non-HTTP contexts', () => {
      const setLogContext = jest.fn();
      const user = { id: 1, tenantId: 'tnt-1' } as any;
      const ctx = createMockContext({
        request: { setLogContext, url: '/test' },
        type: 'ws',
      });

      mockSuperHandleRequest.mockReturnValue(user);
      guard.handleRequest(null, user, null, ctx);

      expect(setLogContext).not.toHaveBeenCalled();
    });

    it('should handle request without setLogContext gracefully', () => {
      const user = { id: 1, tenantId: 'tnt-1' } as any;
      const ctx = createMockContext({ request: { url: '/test' } });

      mockSuperHandleRequest.mockReturnValue(user);
      const result = guard.handleRequest(null, user, null, ctx);

      expect(result).toEqual(user);
    });
  });
});

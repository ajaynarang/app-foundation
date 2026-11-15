import { UnauthorizedException } from '@nestjs/common';
import { currentRls, rlsStorage } from '@appshore/kernel/infrastructure/rls/rls-context';
import { RefreshJwtAuthGuard } from '../refresh-jwt-auth.guard';

jest.mock('@nestjs/passport', () => ({
  AuthGuard: () => {
    // Passport's own handleRequest: the user, or a 401 when validation failed.
    class MockAuthGuard {
      handleRequest(err: unknown, user: unknown) {
        if (err || !user) throw err ?? new (jest.requireActual('@nestjs/common').UnauthorizedException)();
        return user;
      }
    }
    return MockAuthGuard;
  },
}));

describe('RefreshJwtAuthGuard', () => {
  it('should be defined', () => {
    const guard = new RefreshJwtAuthGuard();
    expect(guard).toBeDefined();
  });

  it('should be an instance of RefreshJwtAuthGuard', () => {
    const guard = new RefreshJwtAuthGuard();
    expect(guard).toBeInstanceOf(RefreshJwtAuthGuard);
  });

  describe('tenant context', () => {
    const http = { getType: () => 'http' } as any;

    it("pins the refresh request to the session's workspace, sourced refresh", () => {
      const guard = new RefreshJwtAuthGuard();
      const session = { dbId: 1, tenantDbId: 9, sessionTenantDbId: 9 };

      const seen = rlsStorage.run({}, () => {
        expect(guard.handleRequest(null, session, null, http)).toBe(session);
        return currentRls();
      });

      expect(seen).toEqual({ kind: 'tenant', tenantId: 9, source: 'refresh' });
    });

    it('sets nothing for a session with no workspace (SUPER_ADMIN)', () => {
      const guard = new RefreshJwtAuthGuard();
      const seen = rlsStorage.run({}, () => {
        guard.handleRequest(null, { dbId: 1 }, null, http);
        return currentRls();
      });
      expect(seen).toBeUndefined();
    });

    it('still refuses a failed validation', () => {
      const guard = new RefreshJwtAuthGuard();
      expect(() => guard.handleRequest(null, false, null, http)).toThrow(UnauthorizedException);
    });
  });
});

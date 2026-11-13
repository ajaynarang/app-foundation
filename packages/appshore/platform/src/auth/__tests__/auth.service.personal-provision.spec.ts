// A real 12-round hash takes seconds under a parallel test run; the hook order is what this spec is about.
jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('hashed'), compare: jest.fn() }));

import { AuthService } from '../auth.service';
import type { TenantProvisionHooks } from '../../domains/platform-hooks';

/**
 * A personal-mode signup creates an ACTIVE workspace with no approval step, so it calls the tenant-provision hook
 * itself: without it a personal workspace never gets what an approved one gets (its AI budget, among others).
 */
describe('AuthService.registerPersonal: the tenant-provision hook', () => {
  const created = {
    id: 11,
    userId: 'user_x',
    email: 'pat@example.com',
    role: 'OWNER',
    tenantId: 42,
    tenant: { id: 42, tenantId: 'ws_x', companyName: "Pat's Workspace", timezone: 'UTC' },
    isActive: true,
  };

  function makeService(hooks?: TenantProvisionHooks) {
    const order: string[] = [];
    const tx = {
      tenant: { create: jest.fn().mockResolvedValue({ id: 42 }) },
      user: { create: jest.fn().mockResolvedValue(created) },
      workspaceMember: { create: jest.fn().mockResolvedValue({}) },
      userPreferences: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => {
        const out = await fn(tx);
        order.push('commit');
        return out;
      }),
    };
    const jwt = {
      generateTokenPair: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r', refreshTokenId: 'rid' }),
    };
    const loginEvents = { recordSuccess: jest.fn().mockResolvedValue(undefined) };
    const service = new AuthService(
      prisma as never,
      jwt as never,
      {} as never,
      {} as never,
      {} as never,
      loginEvents as never,
      {} as never,
      {} as never,
      hooks,
    );
    return { service, order, prisma };
  }

  const dto = { email: 'pat@example.com', password: 'Password123!', firstName: 'Pat', lastName: 'Lee' };
  const meta = { ip: null, userAgent: null };

  it('calls tenantApproved with the new workspace, after the signup committed', async () => {
    const calls: string[] = [];
    const hooks = {
      tenantApproved: jest.fn(async () => {
        calls.push('hook');
      }),
    };
    const made = makeService(hooks);
    await made.service.registerPersonal(dto, meta);
    expect(hooks.tenantApproved).toHaveBeenCalledWith(42);
    expect([...made.order, ...calls]).toEqual(['commit', 'hook']);
  });

  it('a failing hook never fails the signup', async () => {
    const hooks = { tenantApproved: jest.fn().mockRejectedValue(new Error('seed down')) };
    const result = await makeService(hooks).service.registerPersonal(dto, meta);
    expect(result.accessToken).toBe('a');
  });

  it('works with no hook bound', async () => {
    await expect(makeService(undefined).service.registerPersonal(dto, meta)).resolves.toMatchObject({
      refreshToken: 'r',
    });
  });
});

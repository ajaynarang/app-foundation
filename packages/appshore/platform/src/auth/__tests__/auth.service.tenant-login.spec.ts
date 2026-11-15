import { ConflictException, Logger, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../auth.service';
import { IdentityResolverService } from '../identity-resolver.service';

/**
 * Tenant-aware sign-in. `User` is unique on `(tenantId, email)`, so one email can have several live accounts (left
 * over from before one-account-per-email). The login must look at all of them, sign in only on exactly one password
 * match, and put the session in the hinted workspace. The resolver is real; Prisma is a fake keyed on the rows below.
 */

const meta = { ip: '203.0.113.9', userAgent: 'tenant-login-spec' };

const tenantA = { id: 1, tenantId: 'ten_a', companyName: 'Acme', status: 'ACTIVE', isActive: true };
const tenantB = { id: 2, tenantId: 'ten_b', companyName: 'Beta', status: 'ACTIVE', isActive: true };
const tenantC = { id: 3, tenantId: 'ten_c', companyName: 'Gamma', status: 'ACTIVE', isActive: true };
const tenants = [tenantA, tenantB, tenantC];

let hashes: Record<string, string>;
beforeAll(async () => {
  hashes = {
    alpha: await bcrypt.hash('alpha-password', 4),
    beta: await bcrypt.hash('beta-password', 4),
  };
});

type Row = Record<string, any>;

function account(id: number, tenant: Row | null, overrides: Row = {}): Row {
  return {
    id,
    userId: `user_${id}`,
    email: 'sam@example.com',
    firstName: 'Sam',
    lastName: 'Lee',
    role: 'ADMIN',
    isActive: true,
    deletedAt: null,
    tenantId: tenant?.id ?? null,
    tenant,
    passwordHash: hashes.alpha,
    ...overrides,
  };
}

function build(state: { users: Row[]; memberships?: Row[]; multiTenancy?: { enabled: boolean } }) {
  const memberships = state.memberships ?? [];
  const prisma = {
    user: {
      findMany: jest.fn(async ({ where }: any) =>
        state.users
          .filter((u) => u.email === where.email && u.deletedAt === null && (!where.isActive || u.isActive))
          .sort((a, b) => a.id - b.id),
      ),
      findFirst: jest.fn(async ({ where }: any) => state.users.find((u) => u.phone && u.phone === where.phone) ?? null),
      update: jest.fn(async () => ({})),
    },
    tenant: {
      findUnique: jest.fn(async ({ where }: any) => tenants.find((t) => t.tenantId === where.tenantId) ?? null),
    },
    workspaceMember: {
      findMany: jest.fn(async ({ where }: any) =>
        memberships.filter((m) => m.tenantId === where.tenantId && where.userId.in.includes(m.userId)),
      ),
    },
    passwordResetToken: { create: jest.fn(async (_args: { data: { userId: number } }) => ({})) },
  };
  const config = {
    get: (key: string) => (key === 'multiTenancy' ? (state.multiTenancy ?? { enabled: true }) : undefined),
  };
  const jwt = {
    generateTokenPair: jest.fn(async () => ({ accessToken: 'at', refreshToken: 'rt', refreshTokenId: 'rt-id' })),
  };
  const loginEvents = { recordSuccess: jest.fn(), recordFailure: jest.fn(), recordLogout: jest.fn() };
  const email = { sendEmail: jest.fn(async (_message: { to: string; text: string }) => undefined) };
  const pin = { verifyPin: jest.fn(async (pinValue: string) => pinValue === '1234') };
  const twilio = { sendVerification: jest.fn(), checkVerification: jest.fn(async () => true) };
  const resolver = new IdentityResolverService(prisma as any, config as any);
  const service = new AuthService(
    prisma as any,
    jwt as any,
    {} as any,
    pin as any,
    twilio as any,
    loginEvents as any,
    email as any,
    resolver,
  );
  return { service, prisma, jwt, loginEvents, email, twilio };
}

const sessionOf = (jwt: { generateTokenPair: jest.Mock }) => jwt.generateTokenPair.mock.calls[0][0];

describe('AuthService.loginWithPassword — tenant-aware', () => {
  it('a single account signs in to its default workspace', async () => {
    const { service, jwt, loginEvents } = build({ users: [account(10, tenantA)] });
    const result = await service.loginWithPassword({ email: 'sam@example.com', password: 'alpha-password' }, meta);
    expect(sessionOf(jwt)).toMatchObject({ id: 10, tenantId: 'ten_a', tenantDbId: 1, role: 'ADMIN' });
    expect(result.user).toMatchObject({ tenantId: 'ten_a', tenantName: 'Acme' });
    expect(loginEvents.recordSuccess).toHaveBeenCalledWith(expect.objectContaining({ userId: 10, tenantId: 1 }));
  });

  it('two accounts with different passwords: the one whose password matches signs in, the other is untouched', async () => {
    const { service, jwt, loginEvents } = build({
      users: [account(10, tenantA), account(11, tenantB, { passwordHash: hashes.beta })],
    });
    await service.loginWithPassword({ email: 'sam@example.com', password: 'beta-password' }, meta);
    expect(sessionOf(jwt)).toMatchObject({ id: 11, tenantId: 'ten_b' });
    expect(loginEvents.recordFailure).not.toHaveBeenCalled();
  });

  it('the older account no longer wins by default: a password for the newer one does not fail', async () => {
    const { service, jwt } = build({
      users: [account(10, tenantA), account(11, tenantB, { passwordHash: hashes.beta })],
    });
    await expect(
      service.loginWithPassword({ email: 'sam@example.com', password: 'beta-password' }, meta),
    ).resolves.toBeDefined();
    expect(sessionOf(jwt).id).toBe(11);
  });

  it('no match is the generic 401, with a failure recorded on each account checked', async () => {
    const { service, loginEvents, jwt } = build({
      users: [account(10, tenantA), account(11, tenantB, { passwordHash: hashes.beta })],
    });
    await expect(service.loginWithPassword({ email: 'sam@example.com', password: 'wrong' }, meta)).rejects.toThrow(
      new UnauthorizedException('Invalid email or password'),
    );
    expect(loginEvents.recordFailure).toHaveBeenCalledTimes(2);
    expect(loginEvents.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 10, tenantId: 1, failReason: 'invalid_credentials' }),
    );
    expect(loginEvents.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 11, tenantId: 2, failReason: 'invalid_credentials' }),
    );
    expect(jwt.generateTokenPair).not.toHaveBeenCalled();
  });

  it('two accounts with the same password: 409 WORKSPACE_SELECTION_REQUIRED naming both workspaces, then the hint signs in', async () => {
    const state = { users: [account(10, tenantA), account(11, tenantB)] };
    const first = build(state);
    const err = await first.service
      .loginWithPassword({ email: 'sam@example.com', password: 'alpha-password' }, meta)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({
      code: 'WORKSPACE_SELECTION_REQUIRED',
      workspaces: [
        { tenantId: 'ten_a', name: 'Acme' },
        { tenantId: 'ten_b', name: 'Beta' },
      ],
    });
    expect(first.jwt.generateTokenPair).not.toHaveBeenCalled();
    expect(first.loginEvents.recordFailure).not.toHaveBeenCalled();

    const retry = build(state);
    await retry.service.loginWithPassword(
      { email: 'sam@example.com', password: 'alpha-password', tenantId: 'ten_b' },
      meta,
    );
    expect(sessionOf(retry.jwt)).toMatchObject({ id: 11, tenantId: 'ten_b', tenantDbId: 2 });
  });

  it('a hint the account has no membership in is the same 401', async () => {
    const { service, jwt } = build({ users: [account(10, tenantA)] });
    await expect(
      service.loginWithPassword({ email: 'sam@example.com', password: 'alpha-password', tenantId: 'ten_c' }, meta),
    ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
    expect(jwt.generateTokenPair).not.toHaveBeenCalled();
  });

  it('an unknown hint is the same 401', async () => {
    const { service } = build({ users: [account(10, tenantA)] });
    await expect(
      service.loginWithPassword({ email: 'sam@example.com', password: 'alpha-password', tenantId: 'ten_nope' }, meta),
    ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
  });

  it('one account with two memberships: no hint lands in the default, the hint lands in that workspace with its role', async () => {
    const state = {
      users: [account(10, tenantA)],
      memberships: [
        { userId: 10, tenantId: 1, role: 'ADMIN' },
        { userId: 10, tenantId: 2, role: 'MEMBER' },
      ],
    };
    const plain = build(state);
    await plain.service.loginWithPassword({ email: 'sam@example.com', password: 'alpha-password' }, meta);
    expect(sessionOf(plain.jwt)).toMatchObject({ tenantId: 'ten_a', tenantDbId: 1, role: 'ADMIN' });

    const hinted = build(state);
    const result = await hinted.service.loginWithPassword(
      { email: 'sam@example.com', password: 'alpha-password', tenantId: 'ten_b' },
      meta,
    );
    expect(sessionOf(hinted.jwt)).toMatchObject({ tenantId: 'ten_b', tenantDbId: 2, role: 'MEMBER' });
    expect(result.user).toMatchObject({ tenantId: 'ten_b', tenantName: 'Beta', role: 'MEMBER' });
    expect(hinted.loginEvents.recordSuccess).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 2 }));
  });

  it('a hinted workspace that is inactive refuses the sign-in', async () => {
    const inactive = { ...tenantB, isActive: false };
    const { service } = build({
      users: [account(10, tenantA)],
      memberships: [{ userId: 10, tenantId: 2, role: 'MEMBER' }],
    });
    tenants[1] = inactive;
    try {
      await expect(
        service.loginWithPassword({ email: 'sam@example.com', password: 'alpha-password', tenantId: 'ten_b' }, meta),
      ).rejects.toThrow(UnauthorizedException);
    } finally {
      tenants[1] = tenantB;
    }
  });

  it('a deleted duplicate is never a candidate', async () => {
    const { service, jwt } = build({
      users: [account(10, tenantA, { deletedAt: new Date() }), account(11, tenantB)],
    });
    await service.loginWithPassword({ email: 'sam@example.com', password: 'alpha-password' }, meta);
    expect(sessionOf(jwt).id).toBe(11);
  });

  it('accounts without a password still answer PASSWORD_NOT_SET', async () => {
    const { service } = build({ users: [account(10, tenantA, { passwordHash: null })] });
    const err = await service
      .loginWithPassword({ email: 'sam@example.com', password: 'alpha-password' }, meta)
      .catch((e) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(err.getResponse()).toMatchObject({ code: 'PASSWORD_NOT_SET' });
  });

  it('single-tenant mode ignores the hint and signs in as before', async () => {
    const { service, jwt } = build({ users: [account(10, tenantA)], multiTenancy: { enabled: false } });
    await service.loginWithPassword(
      { email: 'sam@example.com', password: 'alpha-password', tenantId: 'ten_anything' },
      meta,
    );
    expect(sessionOf(jwt)).toMatchObject({ id: 10, tenantId: 'ten_a' });
  });
});

describe('AuthService.forgotPassword — every account behind the address', () => {
  it('two accounts: one token and one email each, each naming its workspace', async () => {
    const { service, prisma, email } = build({ users: [account(10, tenantA), account(11, tenantB)] });
    await service.forgotPassword({ email: 'sam@example.com' });
    expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(2);
    const userIds = prisma.passwordResetToken.create.mock.calls.map((call: any[]) => call[0].data.userId);
    expect(userIds.sort()).toEqual([10, 11]);
    expect(email.sendEmail).toHaveBeenCalledTimes(2);
    const bodies = email.sendEmail.mock.calls.map((call: any[]) => call[0].text);
    expect(bodies.some((text: string) => text.includes('Acme'))).toBe(true);
    expect(bodies.some((text: string) => text.includes('Beta'))).toBe(true);
  });

  it('one account: one email, worded as before (no workspace name)', async () => {
    const { service, email } = build({ users: [account(10, tenantA)] });
    await service.forgotPassword({ email: 'sam@example.com' });
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    expect(email.sendEmail.mock.calls[0][0].text).not.toContain('Acme');
  });

  it('the hint narrows it to that workspace', async () => {
    const { service, prisma } = build({ users: [account(10, tenantA), account(11, tenantB)] });
    await service.forgotPassword({ email: 'sam@example.com', tenantId: 'ten_b' });
    expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
    expect(prisma.passwordResetToken.create.mock.calls[0][0].data.userId).toBe(11);
  });

  it('a send that fails resolves quietly and logs neither the reset link nor the address', async () => {
    const { service, email } = build({ users: [account(10, tenantA)] });
    email.sendEmail.mockRejectedValueOnce(new Error('No email provider is configured'));
    const spies = (['log', 'warn', 'error', 'debug'] as const).map((level) =>
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined),
    );

    await expect(service.forgotPassword({ email: 'sam@example.com' })).resolves.toBeUndefined();

    const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    expect(logged).toContain('Password reset email was not sent');
    expect(logged).not.toContain('reset-password');
    expect(logged).not.toContain('token=');
    expect(logged).not.toContain('sam@example.com');
    spies.forEach((spy) => spy.mockRestore());
  });

  it('disabled accounts get nothing, and an unknown address resolves quietly', async () => {
    const { service, email } = build({ users: [account(10, tenantA, { isActive: false })] });
    await expect(service.forgotPassword({ email: 'sam@example.com' })).resolves.toBeUndefined();
    await expect(service.forgotPassword({ email: 'nobody@example.com' })).resolves.toBeUndefined();
    expect(email.sendEmail).not.toHaveBeenCalled();
  });
});

describe('AuthService phone sign-in — the hint and the session workspace', () => {
  const phoneUser = () =>
    account(10, tenantA, { phone: '+15555550100', phoneVerified: true, pinHash: 'pin-hash', email: null });
  const memberOfB = [{ userId: 10, tenantId: 2, role: 'MEMBER' }];

  it('PIN login with a hint lands in that workspace with its role', async () => {
    const { service, jwt } = build({ users: [phoneUser()], memberships: memberOfB });
    await service.loginWithPhone({ phone: '+15555550100', pin: '1234', tenantId: 'ten_b' });
    expect(sessionOf(jwt)).toMatchObject({ tenantId: 'ten_b', tenantDbId: 2, role: 'MEMBER' });
  });

  it('PIN login without a hint lands in the default workspace', async () => {
    const { service, jwt } = build({ users: [phoneUser()], memberships: memberOfB });
    await service.loginWithPhone({ phone: '+15555550100', pin: '1234' });
    expect(sessionOf(jwt)).toMatchObject({ tenantId: 'ten_a', role: 'ADMIN' });
  });

  it('PIN login with a hint the account has no membership in is a 401', async () => {
    const { service, jwt } = build({ users: [phoneUser()] });
    await expect(service.loginWithPhone({ phone: '+15555550100', pin: '1234', tenantId: 'ten_c' })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(jwt.generateTokenPair).not.toHaveBeenCalled();
  });

  it('OTP login takes the hint, and refuses one with no membership', async () => {
    const ok = build({ users: [phoneUser()], memberships: memberOfB });
    await ok.service.loginWithOtp({ phone: '+15555550100', code: '123456', tenantId: 'ten_b' });
    expect(sessionOf(ok.jwt)).toMatchObject({ tenantId: 'ten_b', role: 'MEMBER' });

    const refused = build({ users: [phoneUser()] });
    await expect(
      refused.service.loginWithOtp({ phone: '+15555550100', code: '123456', tenantId: 'ten_c' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('sending an OTP with a hint the account has no membership in sends nothing', async () => {
    const { service, twilio } = build({ users: [phoneUser()] });
    await service.sendPhoneOtp('+15555550100', 'ten_c');
    expect(twilio.sendVerification).not.toHaveBeenCalled();
    await service.sendPhoneOtp('+15555550100');
    expect(twilio.sendVerification).toHaveBeenCalledTimes(1);
  });
});

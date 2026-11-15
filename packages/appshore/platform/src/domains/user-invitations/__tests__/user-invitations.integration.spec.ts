import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@appshore/db';
import { EMAIL_UNIQUE_INDEX_LOCK_KEY } from '@appshore/db/email-uniqueness';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as crypto from 'crypto';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { runAsTenant } from '@appshore/kernel/infrastructure/rls/rls-context';
import { UserInvitationsService } from '../user-invitations.service';
import { UserInvitationsController } from '../user-invitations.controller';
import { hashToken } from '../../../auth/token-hash';
import { AuthService } from '../../../auth/auth.service';
import { JwtTokenService } from '../../../auth/jwt.service';
import { LoginEventService } from '../../../auth/login-event.service';
import { IdentityResolverService } from '../../../auth/identity-resolver.service';
import { PinService } from '../../../auth/pin.service';
import { EmailVerificationService } from '../../../auth/email-verification.service';

/**
 * Invitations against real Postgres, where one live account per email is enforced case-insensitively (index
 * `users_email_live_key`). Every lookup for an existing account must match the index, or an invite in another case
 * finds nobody, creates a second user, and the index refuses it (409 DUPLICATE) — a dead end for the invitee.
 *
 * Holds the index's advisory lock, because specs that need duplicates drop the index under it for their run.
 * Skipped when DATABASE_URL is unset or names no usable database. Every row hangs off the tenants this run creates.
 */
// No default: the spec writes rows, so it runs only against a database someone named.
const DATABASE_URL = process.env.DATABASE_URL;

describe('Invitations and one live account per email (Postgres)', () => {
  let pool: pg.Pool;
  let lockClient: pg.Client | undefined;
  let prisma: PrismaClient;
  let ready = false;
  let service: UserInvitationsService;
  const suffix = crypto.randomBytes(4).toString('hex');
  const tenantIds: number[] = [];
  /** The raw tokens the service emailed, newest last. */
  const emailedTokens: string[] = [];
  /** Every other email sent (verification links, reset links, notices), newest last. */
  const sentMail: { to: string; text: string }[] = [];
  let n = 0;
  let auth: AuthService;
  let controller: UserInvitationsController;
  const pins = new PinService();
  /** The raw token in the newest mail to `to` whose link goes to `path`. */
  const linkTokenIn = (to: string, path: string): string => {
    const mail = [...sentMail].reverse().find((m) => m.to === to.toLowerCase() && m.text.includes(path));
    if (!mail) throw new Error(`no ${path} mail to ${to}`);
    return new URL(mail.text.match(/https?:\/\/\S+/)![0]).searchParams.get('token') as string;
  };

  beforeAll(async () => {
    if (!DATABASE_URL) {
      console.warn('user-invitations.integration: DATABASE_URL is unset — skipping');
      return;
    }
    try {
      pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });
      prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
      await prisma.user.count({ where: { email: 'none' } });
    } catch (err) {
      console.warn(`user-invitations.integration: no usable database (${(err as Error).message}) — skipping`);
      return;
    }
    lockClient = new pg.Client({ connectionString: DATABASE_URL });
    await lockClient.connect();
    await lockClient.query('SELECT pg_advisory_lock($1)', [EMAIL_UNIQUE_INDEX_LOCK_KEY]);
    const config: Record<string, unknown> = {
      'jwt.accessSecret': 'invitation-spec-access-secret-32-chars!!',
      'jwt.refreshSecret': 'invitation-spec-refresh-secret-32-chars!',
      'jwt.accessExpiry': '15m',
      'jwt.refreshExpiry': '7d',
      'jwt.sessionMaxAge': '30d',
      multiTenancy: { enabled: true, implicitTenantId: 1, mode: 'multi' },
    };
    const configService = { get: (key: string) => config[key] } as any;
    const mail = {
      sendEmail: async ({ to, text }: { to: string; text: string }) => {
        sentMail.push({ to, text });
      },
    };
    const emailVerification = new EmailVerificationService(prisma as any, mail as any, configService);
    auth = new AuthService(
      prisma as any,
      new JwtTokenService(new NestJwtService({}), configService, prisma as any),
      {} as any,
      pins,
      {} as any,
      new LoginEventService(prisma as any),
      mail as any,
      new IdentityResolverService(prisma as any, configService),
      emailVerification,
    );
    service = new UserInvitationsService(
      prisma as any,
      {
        sendUserInvitation: async (
          _to: string,
          _first: string,
          _last: string,
          _by: string,
          _co: string,
          raw: string,
        ) => {
          emailedTokens.push(raw);
        },
      } as any,
      { sendSms: async () => undefined } as any,
      { checkVerification: async () => true } as any,
      { hashPin: async () => 'pin-hash' } as any,
      { get: () => undefined } as any,
      { assertUserSeatAvailable: async () => undefined } as any,
      {} as any,
      emailVerification,
    );
    controller = new UserInvitationsController(service, auth, configService);
    ready = true;
  }, 60_000);

  afterAll(async () => {
    if (ready) {
      const users = {
        OR: [{ tenantId: { in: tenantIds } }, { userId: { startsWith: 'user_ui_', endsWith: `_${suffix}` } }],
      };
      const userIds = (await prisma.user.findMany({ where: users, select: { id: true } })).map((u) => u.id);
      await prisma.emailVerificationToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.loginEvent.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.userPreferences.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.userInvitation.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.workspaceMember.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.user.deleteMany({ where: { userId: { startsWith: 'user_ui_', endsWith: `_${suffix}` } } });
      await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
    if (lockClient) {
      await lockClient.query('SELECT pg_advisory_unlock($1)', [EMAIL_UNIQUE_INDEX_LOCK_KEY]);
      await lockClient.end();
    }
    await prisma?.$disconnect().catch(() => undefined);
    await pool?.end().catch(() => undefined);
  });

  const makeTenant = async () => {
    const tenant = await prisma.tenant.create({
      data: { tenantId: `ten_ui_${++n}_${suffix}`, companyName: `Invite ${n}`, isActive: true, status: 'ACTIVE' },
    });
    tenantIds.push(tenant.id);
    return tenant;
  };
  /** A live account with a membership in its home tenant. */
  const makeMember = async (tenantId: number, email: string, extra: Record<string, unknown> = {}) => {
    const user = await prisma.user.create({
      data: {
        userId: `user_ui_${++n}_${suffix}`,
        email,
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'ADMIN',
        tenantId,
        isActive: true,
        ...extra,
      },
    });
    await prisma.workspaceMember.create({ data: { userId: user.id, tenantId, role: 'ADMIN', isDefault: true } });
    return user;
  };
  /** A pending invitation; `token` is the raw token its link would carry (only its hash is stored). */
  const makeInvitation = async (tenantId: number, invitedBy: number, data: { email?: string; phone?: string }) => {
    const token = `tok_ui_${++n}_${suffix}`;
    const row = await prisma.userInvitation.create({
      data: {
        tenantId,
        invitedBy,
        ...data,
        inviteChannel: data.email ? 'EMAIL' : 'SMS',
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'MEMBER',
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    return { ...row, token };
  };
  const liveAccounts = (email: string) =>
    prisma.user.count({ where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null } });

  /** `POST /invitations/join` as `userDbId`, signed in to `homeTenant`, through the controller (strict mode). */
  const joinAs = (homeTenant: number, userDbId: number, token: string) =>
    runAsTenant(homeTenant, 'jwt', () => controller.joinInvitation({ token }, { dbId: userDbId }));
  const memberships = (userId: number, tenantId: number) =>
    prisma.workspaceMember.count({ where: { userId, tenantId } });

  it('a token alone never attaches an existing account: the public accept is 409, then the signed-in join adds it', async () => {
    if (!ready) return;
    const home = await makeTenant();
    const other = await makeTenant();
    const inviter = await makeMember(other.id, `boss-${suffix}@example.com`);
    const jane = await makeMember(home.id, `Jane-${suffix}@Example.com`, { emailVerified: true });
    const invitation = await makeInvitation(other.id, inviter.id, { email: `jane-${suffix}@example.com` });

    await expect(service.acceptInvitation({ token: invitation.token, password: 'Password123!' })).rejects.toMatchObject(
      {
        status: 409,
        response: { code: 'SIGN_IN_TO_ACCEPT' },
      },
    );
    expect(await memberships(jane.id, other.id)).toBe(0);
    expect(await prisma.userInvitation.findUnique({ where: { id: invitation.id } })).toMatchObject({
      status: 'PENDING',
    });

    // Under RLS_STRICT_CONTEXT=throw (the Jest setup), from Jane's own session tenant.
    await expect(joinAs(home.id, jane.id, invitation.token)).resolves.toEqual({
      workspace: { tenantId: other.tenantId, name: other.companyName },
      role: 'MEMBER',
    });
    expect(await liveAccounts(`jane-${suffix}@example.com`)).toBe(1);
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_tenantId: { userId: jane.id, tenantId: other.id } },
    });
    expect(membership).toMatchObject({ role: 'MEMBER', isDefault: false });
    expect(await prisma.userInvitation.findUnique({ where: { id: invitation.id } })).toMatchObject({
      status: 'ACCEPTED',
      acceptedByUserId: jane.id,
    });
    // A lost answer is safe to retry.
    await expect(joinAs(home.id, jane.id, invitation.token)).resolves.toMatchObject({ role: 'MEMBER' });
  });

  it('the pre-hijack: an unverified account with the invitee email is refused by accept and by join, no membership', async () => {
    if (!ready) return;
    const attackerHome = await makeTenant();
    const victimWorkspace = await makeTenant();
    const inviter = await makeMember(victimWorkspace.id, `boss8-${suffix}@example.com`);
    // The attacker signed up first as the victim's address, with no proof of it.
    const squatter = await makeMember(attackerHome.id, `victim-${suffix}@example.com`, {
      emailVerified: false,
      passwordHash: await bcrypt.hash('attacker-knows-this', 4),
    });
    const invitation = await makeInvitation(victimWorkspace.id, inviter.id, { email: `victim-${suffix}@example.com` });

    await expect(service.acceptInvitation({ token: invitation.token, password: 'Password123!' })).rejects.toMatchObject(
      {
        status: 409,
        response: { code: 'SIGN_IN_TO_ACCEPT' },
      },
    );
    await expect(joinAs(attackerHome.id, squatter.id, invitation.token)).rejects.toMatchObject({
      status: 403,
      response: { code: 'EMAIL_NOT_VERIFIED' },
    });
    expect(await memberships(squatter.id, victimWorkspace.id)).toBe(0);
    expect(await prisma.userInvitation.findUnique({ where: { id: invitation.id } })).toMatchObject({
      status: 'PENDING',
    });
  });

  it('the reclaim: the owner resets, verifies and joins; the squatter phone PIN no longer signs in', async () => {
    if (!ready) return;
    const squatterHome = await makeTenant();
    const workspace = await makeTenant();
    const inviter = await makeMember(workspace.id, `boss9-${suffix}@example.com`);
    const email = `reclaim-${suffix}@example.com`;
    const phone = `+1555${String(parseInt(suffix, 16) % 10_000_000).padStart(7, '0')}`;
    const squatter = await makeMember(squatterHome.id, email, {
      emailVerified: false,
      passwordHash: await bcrypt.hash('attacker-knows-this', 4),
      phone,
      phoneVerified: true,
      pinHash: await pins.hashPin('4321'),
    });
    // A second credential, as an attacker would add: the phone PIN works before the reset.
    await expect(auth.loginWithPhone({ phone, pin: '4321' } as any)).resolves.toMatchObject({
      user: { userId: squatter.userId },
    });
    const invitation = await makeInvitation(workspace.id, inviter.id, { email });

    // The real owner takes the address back with a reset (the link proves the mailbox).
    await auth.forgotPassword({ email } as any);
    await auth.resetPassword({ token: linkTokenIn(email, '/reset-password'), newPassword: 'OwnerPassword1!' });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: squatter.id } })).toMatchObject({
      emailVerified: true,
      phone: null,
      pinHash: null,
    });

    await expect(joinAs(squatterHome.id, squatter.id, invitation.token)).resolves.toMatchObject({ role: 'MEMBER' });
    expect(await memberships(squatter.id, workspace.id)).toBe(1);

    // The squatter's phone PIN no longer reaches the account, or the workspace it just joined.
    await expect(auth.loginWithPhone({ phone, pin: '4321' } as any)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('join refuses another email (403 INVITATION_EMAIL_MISMATCH) and writes nothing', async () => {
    if (!ready) return;
    const home = await makeTenant();
    const other = await makeTenant();
    const inviter = await makeMember(other.id, `boss10-${suffix}@example.com`);
    const bob = await makeMember(home.id, `bob-${suffix}@example.com`, { emailVerified: true });
    const invitation = await makeInvitation(other.id, inviter.id, { email: `alice-${suffix}@example.com` });

    await expect(joinAs(home.id, bob.id, invitation.token)).rejects.toMatchObject({
      status: 403,
      response: { code: 'INVITATION_EMAIL_MISMATCH' },
    });
    expect(await memberships(bob.id, other.id)).toBe(0);
  });

  it('a new account from an emailed-only token starts verified; from a shared link, unverified with a link emailed', async () => {
    if (!ready) return;
    const tenant = await makeTenant();
    const inviter = await makeMember(tenant.id, `boss11-${suffix}@example.com`);

    const emailed = await makeInvitation(tenant.id, inviter.id, { email: `fresh-${suffix}@example.com` });
    const viaEmail = await service.acceptInvitation({ token: emailed.token, password: 'Password123!' });
    expect(viaEmail).toMatchObject({ emailVerified: true, firebaseUid: null, tenantId: tenant.id });
    expect(await bcrypt.compare('Password123!', viaEmail.passwordHash as string)).toBe(true);
    expect(await prisma.userPreferences.count({ where: { userId: viaEmail.id } })).toBe(1);
    expect(
      await prisma.workspaceMember.findUnique({
        where: { userId_tenantId: { userId: viaEmail.id, tenantId: tenant.id } },
      }),
    ).toMatchObject({ isDefault: true, role: 'MEMBER' });

    const shared = await makeInvitation(tenant.id, inviter.id, { email: `copied-${suffix}@example.com` });
    const { inviteLink } = await service.rotateInvitationLink(shared.invitationId, tenant.tenantId);
    const viaLink = await service.acceptInvitation({
      token: new URL(inviteLink).searchParams.get('token') as string,
      password: 'Password123!',
    });
    expect(viaLink.emailVerified).toBe(false);
    expect(await prisma.emailVerificationToken.count({ where: { userId: viaLink.id, usedAt: null } })).toBe(1);
    expect(linkTokenIn(`copied-${suffix}@example.com`, '/verify-email')).toMatch(/^[0-9a-f]{64}$/);

    // The session the controller issues for it: the cookie, no refresh token in the body.
    const response = { cookie: jest.fn(), clearCookie: jest.fn() };
    const third = await makeInvitation(tenant.id, inviter.id, { email: `session-${suffix}@example.com` });
    const answer = await controller.acceptInvitation(
      { token: third.token, password: 'Password123!' },
      { ip: '203.0.113.1', headers: {} } as any,
      response as any,
    );
    expect(answer.user).toMatchObject({ email: `session-${suffix}@example.com`, tenantId: tenant.tenantId });
    expect(answer).not.toHaveProperty('refreshToken');
    expect(response.cookie).toHaveBeenCalledTimes(1);
  });

  it('a phone invite carrying the email of a live account elsewhere is refused with a clear 409, nothing written', async () => {
    if (!ready) return;
    const home = await makeTenant();
    const other = await makeTenant();
    const inviter = await makeMember(other.id, `boss2-${suffix}@example.com`);
    await makeMember(home.id, `Phoned-${suffix}@Example.com`);
    const invitation = await makeInvitation(other.id, inviter.id, {
      email: `phoned-${suffix}@example.com`,
      phone: '+15550001111',
    });

    const err = await service
      .acceptPhoneInvitation({ token: invitation.token, phone: '+15550001111', otp: '000000', pin: '1234' })
      .catch((e) => e);

    // Not the index's raw P2002: a ConflictException that says what to do.
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toMatch(/email link/i);
    expect(await liveAccounts(`phoned-${suffix}@example.com`)).toBe(1);
    expect(await prisma.userInvitation.findUnique({ where: { id: invitation.id } })).toMatchObject({
      status: 'PENDING',
    });
  });

  it('inviting a member of this workspace in another case is refused as already a member', async () => {
    if (!ready) return;
    const tenant = await makeTenant();
    const inviter = await makeMember(tenant.id, `boss3-${suffix}@example.com`);
    await makeMember(tenant.id, `Member-${suffix}@Example.com`);

    await expect(
      service.inviteUser(
        { email: `MEMBER-${suffix}@example.com`, firstName: 'M', lastName: 'Ember', role: 'MEMBER' as any },
        { userId: inviter.userId, role: 'ADMIN', tenantId: tenant.tenantId },
      ),
    ).rejects.toThrow('already a member of your workspace');
  });

  it('a second invite in another case while one is pending is refused', async () => {
    if (!ready) return;
    const tenant = await makeTenant();
    const inviter = await makeMember(tenant.id, `boss4-${suffix}@example.com`);
    await makeInvitation(tenant.id, inviter.id, { email: `pending-${suffix}@example.com` });

    await expect(
      service.inviteUser(
        { email: `Pending-${suffix}@Example.com`, firstName: 'P', lastName: 'Ending', role: 'MEMBER' as any },
        { userId: inviter.userId, role: 'ADMIN', tenantId: tenant.tenantId },
      ),
    ).rejects.toThrow('Invitation already sent to this email');
  });

  it("the migration's SQL hash is the hash the service stores, so a link emailed before the upgrade still resolves", async () => {
    if (!ready) return;
    const tenant = await makeTenant();
    const inviter = await makeMember(tenant.id, `boss5-${suffix}@example.com`);

    await service.inviteUser(
      { email: `hashed-${suffix}@example.com`, firstName: 'H', lastName: 'Ash', role: 'MEMBER' as any },
      { userId: inviter.userId, role: 'ADMIN', tenantId: tenant.tenantId },
    );
    const raw = emailedTokens[emailedTokens.length - 1];

    // The exact expression migration 20261116000000_invitation_token_hash runs over the old plain `token` column.
    const [{ sql_hash }] = await prisma.$queryRawUnsafe<{ sql_hash: string }[]>(
      `SELECT encode(sha256(convert_to($1, 'UTF8')), 'hex') AS sql_hash`,
      raw,
    );
    const stored = await prisma.userInvitation.findFirstOrThrow({
      where: { tenantId: tenant.id, email: `hashed-${suffix}@example.com` },
    });
    expect(stored.tokenHash).toBe(sql_hash);
    expect(stored.tokenHash).toBe(hashToken(raw));
    expect(stored.linkSharedAt).toBeNull();
    await expect(service.previewInvitation(raw)).resolves.toMatchObject({ invitationId: stored.invitationId });
  });

  it('a rotated link replaces the emailed one: the old token is 404, the new one works and is marked shared', async () => {
    if (!ready) return;
    const tenant = await makeTenant();
    const inviter = await makeMember(tenant.id, `boss6-${suffix}@example.com`);
    const invitation = await makeInvitation(tenant.id, inviter.id, { email: `rotated-${suffix}@example.com` });

    const { inviteLink } = await service.rotateInvitationLink(invitation.invitationId, tenant.tenantId);
    const fresh = new URL(inviteLink).searchParams.get('token') as string;

    await expect(service.previewInvitation(invitation.token)).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.acceptInvitation({ token: invitation.token, password: 'Password123!' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.previewInvitation(fresh)).resolves.toMatchObject({ invitationId: invitation.invitationId });
    const row = await prisma.userInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(row.linkSharedAt).not.toBeNull();
    expect(row.tokenHash).toBe(hashToken(fresh));
  });

  it('two concurrent accepts of one token: exactly one wins, the other is a 409, and one account exists', async () => {
    if (!ready) return;
    const tenant = await makeTenant();
    const inviter = await makeMember(tenant.id, `boss7-${suffix}@example.com`);
    const email = `raced-${suffix}@example.com`;
    const invitation = await makeInvitation(tenant.id, inviter.id, { email });

    const results = await Promise.allSettled([
      service.acceptInvitation({ token: invitation.token, password: 'Password123!' }),
      service.acceptInvitation({ token: invitation.token, password: 'Password123!' }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const [lost] = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(lost.reason).toMatchObject({ status: 409, response: { code: 'INVALID_STATE' } });
    expect(await liveAccounts(email)).toBe(1);
    expect(await prisma.workspaceMember.count({ where: { tenantId: tenant.id, user: { email } } })).toBe(1);
  });
});

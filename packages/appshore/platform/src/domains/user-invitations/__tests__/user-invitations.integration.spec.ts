import { ConflictException } from '@nestjs/common';
import { PrismaClient } from '@appshore/db';
import { EMAIL_UNIQUE_INDEX_LOCK_KEY } from '@appshore/db/email-uniqueness';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as crypto from 'crypto';
import { UserInvitationsService } from '../user-invitations.service';

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
  let n = 0;

  beforeAll(async () => {
    if (!DATABASE_URL) {
      console.warn('user-invitations.integration: DATABASE_URL is unset — skipping');
      return;
    }
    try {
      pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
      prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
      await prisma.user.count({ where: { email: 'none' } });
    } catch (err) {
      console.warn(`user-invitations.integration: no usable database (${(err as Error).message}) — skipping`);
      return;
    }
    lockClient = new pg.Client({ connectionString: DATABASE_URL });
    await lockClient.connect();
    await lockClient.query('SELECT pg_advisory_lock($1)', [EMAIL_UNIQUE_INDEX_LOCK_KEY]);
    service = new UserInvitationsService(
      prisma as any,
      { sendUserInvitation: async () => undefined } as any,
      { sendSms: async () => undefined } as any,
      { checkVerification: async () => true } as any,
      { hashPin: async () => 'pin-hash' } as any,
      { get: () => undefined } as any,
      { assertUserSeatAvailable: async () => undefined } as any,
    );
    ready = true;
  }, 60_000);

  afterAll(async () => {
    if (ready) {
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
  const makeMember = async (tenantId: number, email: string) => {
    const user = await prisma.user.create({
      data: { userId: `user_ui_${++n}_${suffix}`, email, firstName: 'Jane', lastName: 'Doe', role: 'ADMIN', tenantId },
    });
    await prisma.workspaceMember.create({ data: { userId: user.id, tenantId, role: 'ADMIN', isDefault: true } });
    return user;
  };
  const makeInvitation = async (tenantId: number, invitedBy: number, data: { email?: string; phone?: string }) =>
    prisma.userInvitation.create({
      data: {
        tenantId,
        invitedBy,
        ...data,
        inviteChannel: data.email ? 'EMAIL' : 'SMS',
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'MEMBER',
        token: `tok_ui_${++n}_${suffix}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
  const liveAccounts = (email: string) =>
    prisma.user.count({ where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null } });

  it('an invite in another case to a live account elsewhere ends as a new membership of that account', async () => {
    if (!ready) return;
    const home = await makeTenant();
    const other = await makeTenant();
    const inviter = await makeMember(other.id, `boss-${suffix}@example.com`);
    const jane = await makeMember(home.id, `Jane-${suffix}@Example.com`);
    const invitation = await makeInvitation(other.id, inviter.id, { email: `jane-${suffix}@example.com` });

    const user = await service.acceptInvitation(invitation.token, `fb_${suffix}`);

    expect(user.id).toBe(jane.id);
    expect(await liveAccounts(`jane-${suffix}@example.com`)).toBe(1);
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_tenantId: { userId: jane.id, tenantId: other.id } },
    });
    expect(membership).toMatchObject({ role: 'MEMBER', isDefault: false });
    expect(await prisma.userInvitation.findUnique({ where: { id: invitation.id } })).toMatchObject({
      status: 'ACCEPTED',
      acceptedByUserId: jane.id,
    });
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
});

import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { PrismaClient } from '@appshore/db';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { AuthService } from '../auth.service';
import { IdentityResolverService } from '../identity-resolver.service';
import { JwtTokenService } from '../jwt.service';
import { LoginEventService } from '../login-event.service';
import {
  CREATE_EMAIL_UNIQUE_INDEX_SQL,
  EMAIL_UNIQUE_INDEX,
  EMAIL_UNIQUE_INDEX_LOCK_KEY,
  emailUniqueIndexExists,
} from '@appshore/db/email-uniqueness';

/**
 * Tenant-aware login against real Postgres: two live accounts on one email (the schema allows it, unique only per
 * tenant), real bcrypt, real refresh rows. Proves the session row lands in the workspace the rules pick, and that the
 * duplicate pair the unit spec fakes can actually exist on a database that predates one-account-per-email.
 *
 * A migrated database refuses that pair (index `users_email_live_key`), so the spec plays such a database: it holds
 * the index's advisory lock for its whole run, drops the index, and recreates it in afterAll once its rows are gone
 * (in a `finally`, failing loudly if it cannot). Every spec that needs the index present takes the same lock first.
 * A copy in a throwaway schema is not used here, because the real AuthService runs through Prisma, which names the
 * `public` schema in every query. A run killed before afterAll leaves the database without the index: the backend
 * then logs `auth.email_uniqueness_unenforced` at boot, and `pnpm accounts:enforce-unique-email` puts it back.
 *
 * Skipped when DATABASE_URL is unset or names no usable database. Every row hangs off the tenants and users this run
 * creates, and is deleted with them in afterAll.
 */
// No default: the spec writes rows, so it runs only against a database someone named.
const DATABASE_URL = process.env.DATABASE_URL;

const NO_DATABASE_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'P1000',
  'P1001',
  'P1003',
  'P1010',
  'P2021',
]);
const isNoDatabase = (err: unknown) => NO_DATABASE_CODES.has((err as { code?: string }).code ?? '');

const meta = { ip: null, userAgent: 'tenant-login-spec' };

describe('Tenant-aware login (Postgres)', () => {
  let pool: pg.Pool;
  let lockClient: pg.Client | undefined;
  let indexWasPresent = false;
  let prisma: PrismaClient;
  let dbReachable = false;
  let auth: AuthService;
  const suffix = crypto.randomBytes(4).toString('hex');
  const email = `dup-${suffix}@example.com`;
  const tenantIds: number[] = [];
  const userIds: number[] = [];
  let tenantA: { id: number; tenantId: string };
  let tenantB: { id: number; tenantId: string };
  let tenantC: { id: number; tenantId: string };
  let older: { id: number };
  let newer: { id: number };

  const setPasswords = async (olderPassword: string, newerPassword: string) => {
    await prisma.user.update({ where: { id: older.id }, data: { passwordHash: await bcrypt.hash(olderPassword, 4) } });
    await prisma.user.update({ where: { id: newer.id }, data: { passwordHash: await bcrypt.hash(newerPassword, 4) } });
  };

  const sessionRowOf = (refreshToken: string) => {
    const { tokenId } = JSON.parse(Buffer.from(refreshToken.split('.')[1], 'base64url').toString('utf8'));
    return prisma.refreshToken.findUniqueOrThrow({ where: { tokenId } });
  };

  beforeAll(async () => {
    if (!DATABASE_URL) {
      console.warn('tenant-login.integration: DATABASE_URL is unset — skipping');
      return;
    }
    try {
      pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
      prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
      await prisma.user.count({ where: { email: 'none' } });
      dbReachable = true;
    } catch (err) {
      if (!isNoDatabase(err)) throw err;
      console.warn(`tenant-login.integration: no usable database (${(err as Error).message}) — skipping`);
      return;
    }

    // Play a database from before the unique-email index (see the header).
    lockClient = new pg.Client({ connectionString: DATABASE_URL });
    await lockClient.connect();
    await lockClient.query('SELECT pg_advisory_lock($1)', [EMAIL_UNIQUE_INDEX_LOCK_KEY]);
    indexWasPresent = await emailUniqueIndexExists(lockClient);
    if (indexWasPresent) await lockClient.query(`DROP INDEX "${EMAIL_UNIQUE_INDEX}"`);

    const makeTenant = async (name: string) => {
      const tenant = await prisma.tenant.create({
        data: { tenantId: `ten_tl_${name}_${suffix}`, companyName: `Login ${name}`, isActive: true, status: 'ACTIVE' },
        select: { id: true, tenantId: true },
      });
      tenantIds.push(tenant.id);
      return tenant;
    };
    tenantA = await makeTenant('a');
    tenantB = await makeTenant('b');
    tenantC = await makeTenant('c');

    const makeUser = async (name: string, tenantId: number) => {
      const user = await prisma.user.create({
        data: {
          userId: `user_tl_${name}_${suffix}`,
          email,
          firstName: 'Dup',
          lastName: name,
          role: 'ADMIN',
          tenantId,
          isActive: true,
        },
        select: { id: true },
      });
      userIds.push(user.id);
      await prisma.workspaceMember.create({ data: { userId: user.id, tenantId, role: 'ADMIN', isDefault: true } });
      return user;
    };
    // Two live accounts on one email, in two tenants: what (tenantId, email) uniqueness allows.
    older = await makeUser('older', tenantA.id);
    newer = await makeUser('newer', tenantB.id);
    // The older account is also a MEMBER of tenant C.
    await prisma.workspaceMember.create({ data: { userId: older.id, tenantId: tenantC.id, role: 'MEMBER' } });

    const config: Record<string, unknown> = {
      'jwt.accessSecret': 'tenant-login-spec-access-secret-32-chars!',
      'jwt.refreshSecret': 'tenant-login-spec-refresh-secret-32-chars',
      'jwt.accessExpiry': '15m',
      'jwt.refreshExpiry': '7d',
      'jwt.sessionMaxAge': '30d',
      multiTenancy: { enabled: true, implicitTenantId: 1, mode: 'multi' },
    };
    const configService = { get: (key: string) => config[key] } as any;
    const tokens = new JwtTokenService(new NestJwtService({}), configService, prisma as any);
    auth = new AuthService(
      prisma as any,
      tokens,
      {} as any,
      {} as any,
      {} as any,
      new LoginEventService(prisma as any),
      { sendEmail: async () => undefined } as any,
      new IdentityResolverService(prisma as any, configService),
    );
  }, 60_000);

  afterAll(async () => {
    try {
      if (dbReachable) {
        await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.loginEvent.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.workspaceMember.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
        await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      }
    } finally {
      // Runs even when the cleanup above fails: the index must come back.
      await restoreIndex();
      await prisma?.$disconnect().catch(() => undefined);
      await pool?.end().catch(() => undefined);
    }
  });

  /** Recreate the index this run dropped, or fail loudly with how to put it back by hand. */
  async function restoreIndex(): Promise<void> {
    if (!lockClient) return;
    try {
      if (indexWasPresent) await lockClient.query(CREATE_EMAIL_UNIQUE_INDEX_SQL);
    } catch (err) {
      throw new Error(
        `tenant-login.integration dropped ${EMAIL_UNIQUE_INDEX} and could not recreate it ` +
          `(${(err as Error).message}). The database named by DATABASE_URL no longer enforces one live account per ` +
          'email: run pnpm accounts:duplicates, merge what it lists, then pnpm accounts:enforce-unique-email.',
      );
    } finally {
      await lockClient.query('SELECT pg_advisory_unlock($1)', [EMAIL_UNIQUE_INDEX_LOCK_KEY]).catch(() => undefined);
      await lockClient.end().catch(() => undefined);
    }
  }

  const it_ = (name: string, fn: () => Promise<void>) =>
    it(name, async () => {
      if (!dbReachable) return;
      await fn();
    });

  it_('different passwords: the newer account signs in with its own password, its session in its tenant', async () => {
    await setPasswords('older-password', 'newer-password');
    const result = await auth.loginWithPassword({ email, password: 'newer-password' }, meta);
    const row = await sessionRowOf(result.refreshToken);
    expect(row.userId).toBe(newer.id);
    expect(row.tenantId).toBe(tenantB.id);
  });

  it_('same password: 409 with both workspaces, then the hint signs in to the chosen one', async () => {
    await setPasswords('shared-password', 'shared-password');
    const err = await auth.loginWithPassword({ email, password: 'shared-password' }, meta).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse().workspaces).toEqual(
      expect.arrayContaining([
        { tenantId: tenantA.tenantId, name: 'Login a' },
        { tenantId: tenantB.tenantId, name: 'Login b' },
      ]),
    );

    const result = await auth.loginWithPassword(
      { email, password: 'shared-password', tenantId: tenantB.tenantId },
      meta,
    );
    const row = await sessionRowOf(result.refreshToken);
    expect(row.userId).toBe(newer.id);
    expect(row.tenantId).toBe(tenantB.id);
  });

  it_(
    'a hint to a membership workspace stores that workspace on the session row, with the membership role',
    async () => {
      await setPasswords('older-password', 'newer-password');
      const result = await auth.loginWithPassword(
        { email, password: 'older-password', tenantId: tenantC.tenantId },
        meta,
      );
      const row = await sessionRowOf(result.refreshToken);
      expect(row.userId).toBe(older.id);
      expect(row.tenantId).toBe(tenantC.id);
      expect(result.user).toMatchObject({ tenantId: tenantC.tenantId, role: 'MEMBER' });
    },
  );

  it_('a hint neither account belongs to is a 401', async () => {
    await setPasswords('older-password', 'newer-password');
    const outsider = await prisma.tenant.create({
      data: { tenantId: `ten_tl_out_${suffix}`, companyName: 'Outsider', isActive: true, status: 'ACTIVE' },
    });
    tenantIds.push(outsider.id);
    await expect(
      auth.loginWithPassword({ email, password: 'older-password', tenantId: outsider.tenantId }, meta),
    ).rejects.toThrow(UnauthorizedException);
  });

  it_('forgot-password writes one reset token for each account', async () => {
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
    await auth.forgotPassword({ email });
    const rows = await prisma.passwordResetToken.findMany({ where: { userId: { in: userIds } } });
    expect(rows.map((r) => r.userId).sort()).toEqual([older.id, newer.id].sort());
  });
});

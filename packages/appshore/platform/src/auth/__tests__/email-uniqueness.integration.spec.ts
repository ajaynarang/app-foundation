import { Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@appshore/db';
import { EMAIL_UNIQUE_INDEX_LOCK_KEY } from '@appshore/db/email-uniqueness';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as crypto from 'crypto';
import { ConflictException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { EmailUniquenessCheck } from '../email-uniqueness.check';
import { TenantsService } from '../../domains/tenants/tenants.service';
import { buildErrorEnvelope } from '../../shared/filters/error-envelope';

/**
 * One live account per email, through Prisma, on a migrated database (index `users_email_live_key`).
 *
 * Proves what a caller sees: a second live account on an address in another tenant is a Prisma P2002, which the
 * error envelope turns into 409 DUPLICATE; that the signup paths look for an existing account the way the index does
 * (in any case), so they refuse with their own 409 before the index has to; and the boot check stays quiet when the
 * index is there.
 *
 * Holds the index's advisory lock, because specs that need duplicates drop the index under it for their run.
 * Skipped when DATABASE_URL is unset or names no usable database.
 */
// No default: the spec writes rows, so it runs only against a database someone named.
const DATABASE_URL = process.env.DATABASE_URL;

describe('One live account per email (Postgres)', () => {
  let pool: pg.Pool;
  let lockClient: pg.Client | undefined;
  let prisma: PrismaClient;
  let ready = false;
  const suffix = crypto.randomBytes(4).toString('hex');
  const tenantIds: number[] = [];

  beforeAll(async () => {
    if (!DATABASE_URL) {
      console.warn('email-uniqueness.integration: DATABASE_URL is unset — skipping');
      return;
    }
    try {
      pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
      prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
      await prisma.user.count({ where: { email: 'none' } });
    } catch (err) {
      console.warn(`email-uniqueness.integration: no usable database (${(err as Error).message}) — skipping`);
      return;
    }
    lockClient = new pg.Client({ connectionString: DATABASE_URL });
    await lockClient.connect();
    await lockClient.query('SELECT pg_advisory_lock($1)', [EMAIL_UNIQUE_INDEX_LOCK_KEY]);
    ready = true;
  }, 60_000);

  afterAll(async () => {
    if (ready) {
      await prisma.user.deleteMany({ where: { userId: { startsWith: `user_eu_`, endsWith: `_${suffix}` } } });
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

  const makeTenant = async (name: string) => {
    const tenant = await prisma.tenant.create({
      data: { tenantId: `ten_eu_${name}_${suffix}`, companyName: `Unique ${name}`, isActive: true, status: 'ACTIVE' },
    });
    tenantIds.push(tenant.id);
    return tenant.id;
  };
  const makeUser = (name: string, tenantId: number, email: string) =>
    prisma.user.create({
      data: {
        userId: `user_eu_${name}_${suffix}`,
        email,
        firstName: 'Unique',
        lastName: name,
        role: 'ADMIN',
        tenantId,
      },
    });

  it('a second live account on the same email in another tenant is P2002, answered as 409 DUPLICATE', async () => {
    if (!ready) return;
    const a = await makeTenant('a');
    const b = await makeTenant('b');
    await makeUser('first', a, `eu-${suffix}@example.com`);

    const err = await makeUser('second', b, `EU-${suffix}@example.com`).catch((e) => e);
    expect(err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(err.code).toBe('P2002');
    expect(buildErrorEnvelope(err, { url: '/x', method: 'POST' } as any)).toMatchObject({
      statusCode: 409,
      code: 'DUPLICATE',
    });
  });

  const liveAccounts = (email: string) =>
    prisma.user.count({ where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null } });

  it('personal signup in another case on a live account is refused as already registered, not a raw DUPLICATE', async () => {
    if (!ready) return;
    await makeUser('personal', await makeTenant('p'), `Personal-${suffix}@Example.com`);
    const auth = new AuthService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    const err = await auth
      .registerPersonal(
        { email: `personal-${suffix}@example.com`, password: 'Password123!', firstName: 'P', lastName: 'S' },
        { ip: null, userAgent: 'email-uniqueness-spec' },
      )
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(await liveAccounts(`personal-${suffix}@example.com`)).toBe(1);
  });

  it('workspace registration in another case on a live account is refused as already registered', async () => {
    if (!ready) return;
    await makeUser('owner', await makeTenant('o'), `Owner-${suffix}@Example.com`);
    const tenants = new TenantsService(prisma as any, {} as any, {} as any);

    const err = await tenants
      .registerTenant({
        companyName: 'Second',
        subdomain: `eu-${suffix}`,
        firstName: 'O',
        lastName: 'W',
        email: `owner-${suffix}@example.com`,
        password: 'Password123!',
      } as any)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toBe('Email is already registered');
    expect(await prisma.tenant.count({ where: { subdomain: `eu-${suffix}` } })).toBe(0);
  });

  it('the boot check finds the index and logs nothing', async () => {
    if (!ready) return;
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      await new EmailUniquenessCheck(prisma as any).onApplicationBootstrap();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

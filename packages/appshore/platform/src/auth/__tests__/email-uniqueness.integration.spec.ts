import { Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@appshore/db';
import { EMAIL_UNIQUE_INDEX_LOCK_KEY } from '@appshore/db/email-uniqueness';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as crypto from 'crypto';
import { EmailUniquenessCheck } from '../email-uniqueness.check';
import { buildErrorEnvelope } from '../../shared/filters/error-envelope';

/**
 * One live account per email, through Prisma, on a migrated database (index `users_email_live_key`).
 *
 * Proves what a caller sees: a second live account on an address in another tenant is a Prisma P2002, which the
 * error envelope turns into 409 DUPLICATE; and the boot check stays quiet when the index is there.
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

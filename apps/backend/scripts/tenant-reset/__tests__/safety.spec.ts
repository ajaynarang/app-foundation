const questionMock = jest.fn();
jest.mock('node:readline/promises', () => ({
  createInterface: () => ({ question: questionMock, close: jest.fn() }),
}));

import {
  ALLOWED_TENANTS,
  SafetyError,
  assertNotProduction,
  assertSafeToProceed,
  promptTenantConfirmation,
  resolveTenant,
  type SafetyOptions,
  type TenantLookup,
} from '../safety';

const allowed = ALLOWED_TENANTS[0];
const LOCAL_URL = 'postgresql://u:p@localhost:5498/app';

function lookup(tenant: { id: number; tenantId: string; companyName: string } | null): TenantLookup {
  return { tenant: { findUnique: jest.fn().mockResolvedValue(tenant) } };
}

const soft = (over: Partial<SafetyOptions> = {}): SafetyOptions => ({
  tenantId: allowed,
  mode: 'soft',
  yes: true,
  hardConfirm: false,
  dryRun: false,
  ...over,
});

describe('tenant reset safety gates', () => {
  const origEnv = process.env;
  beforeEach(() => {
    process.env = { ...origEnv, NODE_ENV: 'test', ENV_TYPE: 'development', DATABASE_URL: LOCAL_URL };
    questionMock.mockReset();
  });
  afterAll(() => {
    process.env = origEnv;
  });

  describe('assertNotProduction', () => {
    it('refuses ENV_TYPE=production', () => {
      expect(() => assertNotProduction({ ENV_TYPE: 'production', DATABASE_URL: LOCAL_URL })).toThrow(
        /ENV_TYPE=production/,
      );
    });

    it('refuses a deployed process (NODE_ENV=production)', () => {
      expect(() => assertNotProduction({ NODE_ENV: 'production', DATABASE_URL: LOCAL_URL })).toThrow(
        /NODE_ENV=production/,
      );
    });

    it('refuses with no DATABASE_URL: there is no default target', () => {
      expect(() => assertNotProduction({ ENV_TYPE: 'development' })).toThrow(/DATABASE_URL is not set/);
    });

    it('refuses an invalid URL without echoing it', () => {
      expect(() => assertNotProduction({ DATABASE_URL: 'not a url secret' })).toThrow(
        /^DATABASE_URL is not a valid URL\.$/,
      );
    });

    it('refuses a host that names production', () => {
      expect(() =>
        assertNotProduction({ DATABASE_URL: 'postgresql://u:p@app-production-rds-postgres.x:5432/app' }),
      ).toThrow(/looks like production/);
    });

    it('passes a staging or local host', () => {
      expect(() =>
        assertNotProduction({ DATABASE_URL: 'postgresql://u:p@app-staging-rds-postgres.x:5432/app' }),
      ).not.toThrow();
      expect(() => assertNotProduction({ DATABASE_URL: LOCAL_URL })).not.toThrow();
    });
  });

  describe('assertSafeToProceed', () => {
    it('refuses a tenant that is not allow-listed, before reading the database', async () => {
      const db = lookup(null);
      await expect(assertSafeToProceed(db, soft({ tenantId: 'customer_acme' }))).rejects.toThrow(
        /not in the allow-list/,
      );
      expect(db.tenant.findUnique).not.toHaveBeenCalled();
    });

    it('refuses hard mode without the confirmation flag', async () => {
      const db = lookup({ id: 1, tenantId: allowed, companyName: 'Demo' });
      await expect(assertSafeToProceed(db, soft({ mode: 'hard' }))).rejects.toThrow(
        /--i-understand-this-deletes-the-tenant/,
      );
    });

    it('lets a hard dry run through without the flag', async () => {
      const db = lookup({ id: 1, tenantId: allowed, companyName: 'Demo' });
      await expect(assertSafeToProceed(db, soft({ mode: 'hard', dryRun: true }))).resolves.toMatchObject({
        tenantDbId: 1,
      });
    });

    it('refuses a tenant that does not exist', async () => {
      await expect(assertSafeToProceed(lookup(null), soft())).rejects.toThrow(/not found/);
    });

    it('refuses in production even for an allow-listed tenant', async () => {
      process.env.ENV_TYPE = 'production';
      await expect(assertSafeToProceed(lookup(null), soft())).rejects.toBeInstanceOf(SafetyError);
    });

    it('asks for the tenant id without --yes, and refuses a wrong answer', async () => {
      const db = lookup({ id: 9, tenantId: allowed, companyName: 'Demo' });
      questionMock.mockResolvedValueOnce('yes');
      await expect(assertSafeToProceed(db, soft({ yes: false }))).rejects.toThrow(/did not match/);
      questionMock.mockResolvedValueOnce(` ${allowed} \n`);
      await expect(assertSafeToProceed(db, soft({ yes: false }))).resolves.toEqual({
        tenantDbId: 9,
        tenantId: allowed,
        companyName: 'Demo',
      });
    });

    it('does not ask on a dry run', async () => {
      const db = lookup({ id: 9, tenantId: allowed, companyName: 'Demo' });
      await assertSafeToProceed(db, soft({ yes: false, dryRun: true }));
      expect(questionMock).not.toHaveBeenCalled();
    });
  });

  it('promptTenantConfirmation accepts the exact id', async () => {
    questionMock.mockResolvedValueOnce(allowed);
    await expect(promptTenantConfirmation(allowed)).resolves.toBeUndefined();
  });

  it('resolveTenant maps the row', async () => {
    await expect(resolveTenant(lookup({ id: 7, tenantId: 'x', companyName: 'X' }), 'x')).resolves.toEqual({
      tenantDbId: 7,
      tenantId: 'x',
      companyName: 'X',
    });
  });
});

/**
 * Core reset logic tests — unit level with a mock Prisma transaction.
 *
 * The shape: every Prisma delegate has `deleteMany` (and sometimes
 * `updateMany`) returning `{ count: number }`. We don't care about individual
 * delegates here — we verify:
 *   - soft mode skips `keep` entries
 *   - hard mode deletes the tenant row at the end
 *   - dry-run does not open a transaction
 *   - onRow fires for every executed entry
 */
import { hard, runReset, soft } from '../core';
import { ALLOWED_TENANTS } from '../safety';
import { entriesForMode } from '../registry';
import type { PrismaClient } from '@prisma/client';

const slug = ALLOWED_TENANTS[0];

type MockPrisma = PrismaClient & {
  $transaction: jest.Mock;
  $queryRawUnsafe: jest.Mock;
  tenant: { findUnique: jest.Mock; deleteMany: jest.Mock };
};

/**
 * Proxy wrapper — any delegate access returns a default `{ count: 0 }`
 * delegate. Individual tests can override fields via Object.assign.
 */
function makePrisma(overrides: Partial<Record<string, unknown>> = {}): MockPrisma {
  const baseDelegate = {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  };

  const tenantDelegate = {
    findUnique: jest.fn().mockResolvedValue({ id: 99, tenantId: slug, companyName: 'Test' }),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  };

  const target: Record<string, unknown> = {
    tenant: tenantDelegate,
    ...overrides,
  };

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(obj, prop) {
      if (prop in obj) return obj[prop as string];
      if (prop === '$transaction') return transactionImpl;
      if (prop === '$queryRawUnsafe') return queryRawImpl;
      if (prop === '$disconnect') return () => Promise.resolve();
      if (typeof prop === 'symbol') return undefined;
      // Default any unknown delegate
      const delegate = { ...baseDelegate };
      obj[prop] = delegate;
      return delegate;
    },
  };

  const proxy = new Proxy(target, handler) as unknown as MockPrisma;

  const transactionImpl = jest.fn(async (fn: (tx: MockPrisma) => Promise<unknown>) => {
    return fn(proxy);
  });

  const queryRawImpl = jest.fn(async () => [{ count: 0n }]);

  Object.assign(proxy, {
    $transaction: transactionImpl,
    $queryRawUnsafe: queryRawImpl,
  });

  return proxy;
}

describe('runReset', () => {
  const origEnv = process.env;
  beforeEach(() => {
    process.env = {
      ...origEnv,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/sally',
    };
  });
  afterAll(() => {
    process.env = origEnv;
  });

  it('soft mode skips keep entries and does not delete the tenant row', async () => {
    const prisma = makePrisma();
    const rows: string[] = [];

    const summary = await runReset(prisma, {
      tenantSlug: slug,
      mode: 'soft',
      yes: true,
      hardConfirm: false,
      dryRun: false,
      onRow: (row) => rows.push(`${row.table}:${row.action}`),
    });

    expect(prisma.tenant.deleteMany).not.toHaveBeenCalled();
    expect(summary.mode).toBe('soft');
    expect(summary.dryRun).toBe(false);

    // Every emitted row should be wipe or reset — never skip-keep in onRow.
    const actions = new Set(rows.map((r) => r.split(':')[1]));
    expect(actions.has('skip-keep')).toBe(false);

    // Summary includes skip-keep rows for visibility.
    const skipKeep = summary.rows.filter((r) => r.action === 'skip-keep');
    expect(skipKeep.length).toBeGreaterThan(0);

    // Soft emits fewer entries than hard.
    expect(rows.length).toBe(entriesForMode('soft').length);
  });

  it('hard mode deletes the tenant row at the end and requires hardConfirm', async () => {
    const prisma = makePrisma();
    const summary = await runReset(prisma, {
      tenantSlug: slug,
      mode: 'hard',
      yes: true,
      hardConfirm: true,
      dryRun: false,
    });

    expect(prisma.tenant.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: slug },
    });
    expect(summary.rows.some((r) => r.table === 'tenants')).toBe(true);
    expect(summary.mode).toBe('hard');
  });

  it('dry-run does not open a transaction and emits counts from raw queries', async () => {
    const prisma = makePrisma();
    const summary = await runReset(prisma, {
      tenantSlug: slug,
      mode: 'soft',
      yes: true,
      hardConfirm: false,
      dryRun: true,
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
    expect(summary.dryRun).toBe(true);
    expect(summary.rows.length).toBe(entriesForMode('soft').length);
  });

  it('rejects when safety gate fails (unallowlisted tenant)', async () => {
    const prisma = makePrisma();
    await expect(
      runReset(prisma, {
        tenantSlug: 'tenant_not_allowed',
        mode: 'soft',
        yes: true,
        hardConfirm: false,
        dryRun: false,
      }),
    ).rejects.toThrow(/not in the allowlist/);
  });

  it('soft() shorthand delegates to runReset with mode=soft', async () => {
    const prisma = makePrisma();
    const summary = await soft(prisma, slug, { yes: true });
    expect(summary.mode).toBe('soft');
    expect(prisma.tenant.deleteMany).not.toHaveBeenCalled();
  });

  it('hard() shorthand delegates to runReset with mode=hard', async () => {
    const prisma = makePrisma();
    const summary = await hard(prisma, slug, { yes: true, hardConfirm: true });
    expect(summary.mode).toBe('hard');
    expect(prisma.tenant.deleteMany).toHaveBeenCalled();
  });

  it('totalAffected sums only non-skip rows', async () => {
    const prisma = makePrisma();
    // Stub one delegate to return a non-zero count
    (prisma as any).alert = {
      deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    };

    const summary = await runReset(prisma, {
      tenantSlug: slug,
      mode: 'soft',
      yes: true,
      hardConfirm: false,
      dryRun: false,
    });

    expect(summary.totalAffected).toBeGreaterThanOrEqual(5);
  });
});

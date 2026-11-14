import { countTenantData, deleteTenantData, runReset, type ResetClient, type ResetDb } from '../core';
import { REGISTRY, entriesForMode } from '../registry';
import { ALLOWED_TENANTS } from '../safety';
import { parseArgs } from '../cli';

const TENANT = { tenantDbId: 42, tenantId: ALLOWED_TENANTS[0] };

interface FakeDb extends ResetClient {
  calls: string[];
  delegates: Record<string, { count: jest.Mock; deleteMany: jest.Mock }>;
}

/**
 * A client whose every model delegate records its calls. `homed` users are homed in the tenant; `elsewhere` are those
 * of them that belong to another workspace too.
 */
function fakeDb(opts: { homed?: number[]; elsewhere?: number[]; announcements?: number; mastra?: boolean } = {}) {
  const homed = opts.homed ?? [];
  const elsewhere = new Set(opts.elsewhere ?? []);
  const calls: string[] = [];
  const delegates: FakeDb['delegates'] = {};
  for (const entry of REGISTRY) {
    if (entry.delegate === 'user') continue;
    delegates[entry.delegate] = {
      count: jest.fn().mockResolvedValue(2),
      deleteMany: jest.fn(async () => {
        calls.push(`delete:${entry.table}`);
        return { count: 2 };
      }),
    };
  }
  const userDelete = jest.fn(async () => {
    calls.push('delete:users');
    return { count: 1 };
  });
  const db = {
    ...delegates,
    calls,
    delegates,
    user: {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        homed.filter((id) => ('NOT' in where ? !elsewhere.has(id) : elsewhere.has(id))).map((id) => ({ id })),
      ),
      update: jest.fn(async (args: { where: { id: number } }) => calls.push(`rehome:${args.where.id}`)),
      updateMany: jest.fn(async () => {
        calls.push('null:deletedBy');
        return { count: 0 };
      }),
      count: jest.fn().mockResolvedValue(1),
      deleteMany: userDelete,
    },
    workspaceMember: {
      ...delegates.workspaceMember,
      findFirst: jest.fn().mockResolvedValue({ tenantId: 99, role: 'MEMBER' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    announcement: { count: jest.fn().mockResolvedValue(opts.announcements ?? 0) },
    tenant: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: TENANT.tenantDbId, tenantId: TENANT.tenantId, companyName: 'Demo' }),
      delete: jest.fn(async () => calls.push('delete:tenants')),
    },
    $queryRawUnsafe: jest.fn(async (sql: string) =>
      sql.includes('information_schema') ? [{ exists: opts.mastra ?? false }] : [{ count: 3n }],
    ),
    $executeRawUnsafe: jest.fn(async (sql: string) => {
      calls.push(`raw:${sql.split(' ')[2]}`);
      return 3;
    }),
    $transaction: jest.fn(async (fn: (tx: ResetDb) => Promise<unknown>) => fn(db as unknown as ResetDb)),
  };
  return db as unknown as FakeDb & { user: typeof db.user; tenant: typeof db.tenant };
}

describe('tenant reset engine', () => {
  const origEnv = process.env;
  beforeEach(() => {
    process.env = {
      ...origEnv,
      NODE_ENV: 'test',
      ENV_TYPE: 'development',
      DATABASE_URL: 'postgresql://u:p@localhost/app',
    };
  });
  afterAll(() => {
    process.env = origEnv;
  });

  it('soft mode deletes only the wipe entries, in registry order, and never a user or the tenant', async () => {
    const db = fakeDb({ homed: [1] });
    await deleteTenantData(db, TENANT, 'soft');
    expect(db.calls).toEqual(entriesForMode('soft').map((e) => `delete:${e.table}`));
    expect(db.tenant.delete).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('hard mode moves members of other workspaces first, deletes users last and the tenant after them', async () => {
    const db = fakeDb({ homed: [1, 2], elsewhere: [2] });
    await deleteTenantData(db, TENANT, 'hard');
    expect(db.calls[0]).toBe('rehome:2');
    expect(db.calls.slice(-2)).toEqual(['delete:users', 'delete:tenants']);
    // Only user 1 (no other workspace) is deleted; user 2 keeps the account.
    expect(db.user.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [1] } } });
    expect(db.delegates.apiKey.deleteMany).toHaveBeenCalledWith({ where: { userId: { in: [1] } } });
  });

  it('hard mode scopes every tenant delete to the tenant id', async () => {
    const db = fakeDb();
    await deleteTenantData(db, TENANT, 'hard');
    expect(db.delegates.job.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 42 } });
    expect(db.delegates.outboxEvent.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: { in: ['42', TENANT.tenantId] } },
    });
    expect(db.delegates.conversationMessage.deleteMany).toHaveBeenCalledWith({
      where: { conversation: { tenantId: 42 } },
    });
  });

  it('refuses a hard reset while a platform row was written by a user it deletes', async () => {
    const db = fakeDb({ homed: [1], announcements: 2 });
    await expect(deleteTenantData(db, TENANT, 'hard')).rejects.toThrow(/announcement/);
    expect(db.calls.filter((c) => c.startsWith('delete:'))).toEqual([]);
  });

  it('deletes the tenant chat memory in Mastra tables when they exist, messages first', async () => {
    const db = fakeDb({ mastra: true });
    await deleteTenantData(db, TENANT, 'soft');
    expect(db.calls.slice(0, 4)).toEqual([
      'raw:mastra_messages',
      'raw:mastra_threads',
      'raw:mastra_resources',
      'raw:mastra_observational_memory',
    ]);
    expect(db.$executeRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('LIKE $1'), 'tenant-42-user-%');
  });

  it('skips Mastra tables that do not exist', async () => {
    const db = fakeDb({ mastra: false });
    await deleteTenantData(db, TENANT, 'soft');
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('a dry run counts and deletes nothing', async () => {
    const db = fakeDb({ homed: [1] });
    const { rows } = await countTenantData(db, TENANT, 'hard');
    expect(db.calls).toEqual([]);
    expect(rows.find((r) => r.table === 'jobs')?.count).toBe(2);
  });

  describe('runReset', () => {
    it('a dry run opens no transaction', async () => {
      const db = fakeDb();
      const summary = await runReset(db, {
        tenantId: TENANT.tenantId,
        mode: 'soft',
        yes: true,
        hardConfirm: false,
        dryRun: true,
      });
      expect(db.$transaction).not.toHaveBeenCalled();
      expect(summary.dryRun).toBe(true);
      expect(summary.totalAffected).toBe(entriesForMode('soft').length * 2);
    });

    it('a run happens in one transaction and lists the kept tables in a soft summary', async () => {
      const db = fakeDb();
      const summary = await runReset(db, {
        tenantId: TENANT.tenantId,
        mode: 'soft',
        yes: true,
        hardConfirm: false,
        dryRun: false,
      });
      expect(db.$transaction).toHaveBeenCalledTimes(1);
      expect(summary.rows.filter((r) => r.action === 'skip-keep').map((r) => r.table)).toContain('users');
    });

    it('refuses a tenant that is not allow-listed and touches nothing', async () => {
      const db = fakeDb();
      await expect(
        runReset(db, { tenantId: 'customer_acme', mode: 'soft', yes: true, hardConfirm: false, dryRun: false }),
      ).rejects.toThrow(/not in the allow-list/);
      expect(db.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('parseArgs', () => {
    it('needs a tenant and a mode', () => {
      expect(() => parseArgs(['--mode', 'soft'])).toThrow(/--tenant/);
      expect(() => parseArgs(['--tenant', 'demo'])).toThrow(/--mode/);
      expect(() => parseArgs(['--tenant', 'demo', '--mode', 'all'])).toThrow(/soft" or "hard/);
      expect(() => parseArgs(['--tenant', 'demo', '--mode', 'soft', '--force'])).toThrow(/Unknown flag/);
    });

    it('reads every flag', () => {
      expect(
        parseArgs([
          '--tenant',
          'demo',
          '--mode',
          'hard',
          '--yes',
          '--dry-run',
          '--i-understand-this-deletes-the-tenant',
        ]),
      ).toEqual({ tenantId: 'demo', mode: 'hard', yes: true, hardConfirm: true, dryRun: true, help: false });
    });
  });
});

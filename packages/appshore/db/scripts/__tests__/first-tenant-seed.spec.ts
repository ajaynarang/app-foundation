/**
 * Seed `00-first-tenant` must never put demo data into production.
 *
 * Outside production it seeds a ready-to-use workspace: the ACTIVE "demo" tenant (multi-tenant) or the implicit
 * tenant (single-tenant), an owner, an admin and a member with dev credentials. With ENV_TYPE=production (set by
 * tools/db/migrate.sh and the deploy workflow's migration job) it creates no demo tenant and no user: single-tenant
 * gets only the implicit tenant row every tenant-scoped query needs, multi-tenant gets nothing.
 *
 * The Prisma client is a hand-made fake that records every write, so this needs no database.
 */

jest.mock('bcrypt', () => ({ hash: jest.fn(async (plain: string) => `hash:${plain}`) }));

type Write = { op: string; args: unknown };

function fakePrisma() {
  const writes: Write[] = [];
  const record =
    (op: string, result: (args: any) => unknown = () => ({ id: 1 })) =>
    async (args: any) => {
      writes.push({ op, args });
      return result(args);
    };
  let nextUserId = 100;
  const prisma = {
    tenant: {
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async () => null),
      create: record('tenant.create', (args) => ({ id: args.data.subdomain === 'demo' ? 1 : 2, ...args.data })),
    },
    user: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      create: record('user.create', (args) => ({ id: nextUserId++, ...args.data })),
      update: record('user.update'),
    },
    userPreferences: { create: record('userPreferences.create') },
    workspaceMember: { upsert: record('workspaceMember.upsert') },
    $executeRawUnsafe: record('$executeRawUnsafe', () => 1),
  };
  return { prisma, writes };
}

async function runSeed(env: Record<string, string | undefined>) {
  const saved = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    let seed: any;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      seed = require('../../prisma/seeds/00-first-tenant.seed').seed;
    });
    const { prisma, writes } = fakePrisma();
    await seed.run(prisma);
    return writes;
  } finally {
    process.env = saved;
  }
}

const createdTenants = (writes: Write[]) =>
  writes.filter((w) => w.op === 'tenant.create').map((w) => (w.args as any).data.subdomain);
const createdUsers = (writes: Write[]) =>
  writes.filter((w) => w.op === 'user.create').map((w) => (w.args as any).data.email);

describe('seed 00-first-tenant', () => {
  const base = { DEFAULT_ADMIN_PASSWORD: 'from-the-env-file', DEFAULT_ADMIN_EMAIL: undefined };

  it('multi-tenant, not production: seeds the demo workspaces and the three demo users', async () => {
    const writes = await runSeed({ ...base, ENV_TYPE: undefined, MULTI_TENANT: undefined });
    expect(createdTenants(writes)).toEqual(['demo', 'demo-two']);
    expect(createdUsers(writes)).toEqual(['owner@example.com', 'admin-user@example.com', 'member@example.com']);
  });

  it('multi-tenant, production: creates no tenant and no user, even with DEFAULT_ADMIN_PASSWORD set', async () => {
    const writes = await runSeed({ ...base, ENV_TYPE: 'production', MULTI_TENANT: undefined });
    expect(createdTenants(writes)).toEqual([]);
    expect(createdUsers(writes)).toEqual([]);
    expect(writes).toEqual([]);
  });

  it('single-tenant, production: creates only the implicit tenant row, no user', async () => {
    const writes = await runSeed({ ...base, ENV_TYPE: 'production', MULTI_TENANT: 'false' });
    expect(createdUsers(writes)).toEqual([]);
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every((w) => w.op === '$executeRawUnsafe')).toBe(true);
  });

  it('ENV_TYPE is matched without regard to case', async () => {
    const writes = await runSeed({ ...base, ENV_TYPE: 'Production', MULTI_TENANT: undefined });
    expect(writes).toEqual([]);
  });

  it('single-tenant, not production: seeds the implicit tenant and the three users', async () => {
    const writes = await runSeed({ ...base, ENV_TYPE: undefined, MULTI_TENANT: 'false' });
    expect(createdUsers(writes)).toEqual(['owner@example.com', 'admin-user@example.com', 'member@example.com']);
  });
});

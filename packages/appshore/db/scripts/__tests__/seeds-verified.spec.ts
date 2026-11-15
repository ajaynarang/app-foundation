/**
 * Every seeded user is created with a verified email (D3). Seeded addresses are the template's own
 * (`@example.com`), so there is no mailbox to prove, and the dev logins must be able to join a second workspace,
 * which needs a verified email. Nothing in the template marks any other account verified: an account proves its
 * address with the verify link, a password reset, or an invitation that only travelled by email.
 *
 * The Prisma client is a hand-made fake that records every user write, so this needs no database.
 */

jest.mock('bcrypt', () => ({ hash: jest.fn(async (plain: string) => `hash:${plain}`) }));
jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  auth: jest.fn(),
  credential: { cert: jest.fn() },
}));

type UserCreate = { data: Record<string, unknown> };

function fakePrisma() {
  const userCreates: UserCreate[] = [];
  let nextId = 100;
  const prisma = {
    tenant: {
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async () => null),
      create: jest.fn(async (args: any) => ({ id: args.data.subdomain === 'demo' ? 1 : 2, ...args.data })),
    },
    user: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      create: jest.fn(async (args: UserCreate) => {
        userCreates.push(args);
        return { id: nextId++, ...args.data };
      }),
      update: jest.fn(async () => ({ id: 1 })),
    },
    userPreferences: { create: jest.fn(async () => ({ id: 1 })) },
    workspaceMember: { upsert: jest.fn(async () => ({ id: 1 })) },
    $executeRawUnsafe: jest.fn(async () => 1),
  };
  return { prisma, userCreates };
}

async function runSeeds(env: Record<string, string | undefined>): Promise<UserCreate[]> {
  const saved = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    const { prisma, userCreates } = fakePrisma();
    for (const file of ['00-first-tenant.seed', '01-super-admin.seed']) {
      let seed: any;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        seed = require(`../../prisma/seeds/${file}`).seed;
      });
      await seed.run(prisma);
    }
    return userCreates;
  } finally {
    process.env = saved;
  }
}

describe('seeded users are verified (D3)', () => {
  it.each([
    ['multi-tenant', { MULTI_TENANT: undefined }],
    ['single-tenant', { MULTI_TENANT: 'false' }],
  ])('%s: every user the seeds create has emailVerified: true', async (_mode, env) => {
    const created = await runSeeds({ ...env, ENV_TYPE: undefined, DEFAULT_ADMIN_PASSWORD: 'from-the-env-file' });

    expect(created.length).toBeGreaterThanOrEqual(2);
    expect(created.map((c) => c.data.email)).toContain('admin@example.com');
    for (const { data } of created) {
      expect({ email: data.email, emailVerified: data.emailVerified }).toEqual({
        email: data.email,
        emailVerified: true,
      });
    }
  });
});

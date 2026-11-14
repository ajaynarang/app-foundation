import { PrismaClient } from '@appshore/db';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { deleteTenantData, type ResetDb } from '../core';

/**
 * The delete order on a real Postgres: a hard reset must get past every foreign key, keep a user who belongs to
 * another workspace, and touch nothing of the other tenant. Skipped when DATABASE_URL is unset or names no usable
 * database. Every row it writes carries a key of its own and is removed in afterAll.
 */
// No default: the spec writes and deletes rows, so it runs only against a database someone named.
const DATABASE_URL = process.env.DATABASE_URL;
const KEY = 'trspec';
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

describe('tenant reset on Postgres (integration)', () => {
  let prisma: PrismaClient;
  let pool: pg.Pool;
  let usable = false;

  const cleanup = async () => {
    const tenants = await prisma.tenant.findMany({
      where: { tenantId: { startsWith: `${KEY}_` } },
      select: { id: true },
    });
    const ids = tenants.map((t) => t.id);
    if (ids.length === 0) {
      await prisma.user.deleteMany({ where: { userId: { startsWith: `${KEY}_` } } });
      return;
    }
    for (const id of ids) {
      await prisma.$transaction((tx) =>
        deleteTenantData(tx as unknown as ResetDb, { tenantDbId: id, tenantId: '' }, 'hard'),
      );
    }
    await prisma.user.deleteMany({ where: { userId: { startsWith: `${KEY}_` } } });
  };

  /** Tenant A holds one user of its own and one who is also a member of B; B holds one user. */
  async function seed() {
    const a = await prisma.tenant.create({ data: { tenantId: `${KEY}_a`, companyName: 'Reset spec A' } });
    const b = await prisma.tenant.create({ data: { tenantId: `${KEY}_b`, companyName: 'Reset spec B' } });
    const user = (userId: string, tenantId: number) =>
      prisma.user.create({ data: { userId, firstName: 'Reset', lastName: 'Spec', role: 'MEMBER', tenantId } });
    const onlyA = await user(`${KEY}_only_a`, a.id);
    const both = await user(`${KEY}_both`, a.id);
    const onlyB = await user(`${KEY}_only_b`, b.id);
    await prisma.workspaceMember.createMany({
      data: [
        { userId: onlyA.id, tenantId: a.id, role: 'MEMBER', isDefault: true },
        { userId: both.id, tenantId: a.id, role: 'MEMBER', isDefault: true },
        { userId: both.id, tenantId: b.id, role: 'ADMIN' },
        { userId: onlyB.id, tenantId: b.id, role: 'MEMBER', isDefault: true },
      ],
    });

    for (const [tenant, author, tag] of [
      [a, onlyA, 'a'],
      [b, onlyB, 'b'],
    ] as const) {
      const conversation = await prisma.conversation.create({
        data: { conversationId: `${KEY}_conv_${tag}`, userMode: 'tenant', tenantId: tenant.id, userId: author.id },
      });
      await prisma.conversationMessage.create({
        data: {
          messageId: `${KEY}_msg_${tag}`,
          conversationId: conversation.id,
          role: 'user',
          content: 'hello',
          inputMode: 'text',
        },
      });
      const ticket = await prisma.supportTicket.create({
        data: {
          ticketNumber: `${KEY}-${tag}`,
          tenantId: tenant.id,
          createdById: author.id,
          subject: 'Spec',
          description: 'Spec',
          conversationId: conversation.id,
        },
      });
      await prisma.supportTicketMessage.create({
        data: { ticketId: ticket.id, authorId: author.id, authorRole: 'user', content: 'hi' },
      });
      await prisma.feedback.create({ data: { tenantId: tenant.id, userId: author.id, message: 'spec' } });
      await prisma.job.create({
        data: { tenantId: tenant.id, category: 'spec', type: 'spec', inputData: {}, submittedBy: author.id },
      });
      await prisma.userInvitation.create({
        data: {
          tenantId: tenant.id,
          firstName: 'In',
          lastName: 'Vite',
          role: 'MEMBER',
          token: `${KEY}_invite_${tag}`,
          expiresAt: new Date(Date.now() + 86_400_000),
          invitedBy: author.id,
        },
      });
      const agent = await prisma.deskAgent.create({
        data: { tenantId: tenant.id, key: `${KEY}_agent`, name: 'Agent', systemPromptKey: 'spec' },
      });
      await prisma.deskResponsibility.create({
        data: { tenantId: tenant.id, agentId: agent.id, key: `${KEY}_resp`, title: 'Spec' },
      });
      await prisma.apiKey.create({
        data: {
          keyHash: `${KEY}_hash_${tag}`.padEnd(40, 'x'),
          keyPrefix: 'spec',
          keyLast4: tag.repeat(4),
          name: 'spec',
          userId: author.id,
        },
      });
    }
    await prisma.apiKey.create({
      data: {
        keyHash: `${KEY}_hash_both`.padEnd(40, 'x'),
        keyPrefix: 'spec',
        keyLast4: 'both',
        name: 'spec',
        userId: both.id,
      },
    });
    return { a, b, onlyA, both, onlyB };
  }

  beforeAll(async () => {
    if (!DATABASE_URL) {
      console.warn('tenant-reset core.integration: DATABASE_URL is unset — skipping');
      return;
    }
    try {
      pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
      prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
      await cleanup();
      usable = true;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code && NO_DATABASE_CODES.has(code)) {
        console.warn(`tenant-reset core.integration: no usable database (${code}) — skipping`);
        return;
      }
      throw err;
    }
  });

  afterEach(async () => {
    if (usable) await cleanup();
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
  });

  it('soft mode deletes activity and keeps the workspace, its people and configuration', async () => {
    if (!usable) return;
    const { a, b, onlyA } = await seed();
    await prisma.$transaction((tx) =>
      deleteTenantData(tx as unknown as ResetDb, { tenantDbId: a.id, tenantId: a.tenantId }, 'soft'),
    );

    expect(await prisma.conversation.count({ where: { tenantId: a.id } })).toBe(0);
    expect(await prisma.supportTicket.count({ where: { tenantId: a.id } })).toBe(0);
    expect(await prisma.job.count({ where: { tenantId: a.id } })).toBe(0);
    expect(await prisma.feedback.count({ where: { tenantId: a.id } })).toBe(0);

    expect(await prisma.tenant.count({ where: { id: a.id } })).toBe(1);
    expect(await prisma.user.count({ where: { id: onlyA.id } })).toBe(1);
    expect(await prisma.workspaceMember.count({ where: { tenantId: a.id } })).toBe(2);
    expect(await prisma.userInvitation.count({ where: { tenantId: a.id } })).toBe(1);
    expect(await prisma.deskAgent.count({ where: { tenantId: a.id } })).toBe(1);

    // The other tenant is untouched.
    expect(await prisma.conversation.count({ where: { tenantId: b.id } })).toBe(1);
    expect(await prisma.job.count({ where: { tenantId: b.id } })).toBe(1);
  });

  it('hard mode deletes the tenant and its own users, and moves a member of another workspace there', async () => {
    if (!usable) return;
    const { a, b, onlyA, both, onlyB } = await seed();
    await prisma.$transaction((tx) =>
      deleteTenantData(tx as unknown as ResetDb, { tenantDbId: a.id, tenantId: a.tenantId }, 'hard'),
    );

    expect(await prisma.tenant.count({ where: { id: a.id } })).toBe(0);
    expect(await prisma.user.count({ where: { id: onlyA.id } })).toBe(0);
    expect(await prisma.apiKey.count({ where: { userId: onlyA.id } })).toBe(0);

    const moved = await prisma.user.findUniqueOrThrow({ where: { id: both.id } });
    expect(moved.tenantId).toBe(b.id);
    expect(moved.role).toBe('ADMIN');
    expect(await prisma.apiKey.count({ where: { userId: both.id } })).toBe(1);
    expect(
      await prisma.workspaceMember.findUniqueOrThrow({
        where: { userId_tenantId: { userId: both.id, tenantId: b.id } },
      }),
    ).toMatchObject({ isDefault: true });

    // The other tenant is untouched.
    expect(await prisma.tenant.count({ where: { id: b.id } })).toBe(1);
    expect(await prisma.user.count({ where: { id: onlyB.id } })).toBe(1);
    expect(await prisma.conversationMessage.count({ where: { conversation: { tenantId: b.id } } })).toBe(1);
    expect(await prisma.supportTicketMessage.count({ where: { ticket: { tenantId: b.id } } })).toBe(1);
    expect(await prisma.deskResponsibility.count({ where: { tenantId: b.id } })).toBe(1);
    expect(await prisma.apiKey.count({ where: { userId: onlyB.id } })).toBe(1);
  });
});

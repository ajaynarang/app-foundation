import { PrismaClient } from '@appshore/db';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

import { DeskMemoryReembedService } from '../desk-memory-reembed.service';

/**
 * The re-embed on a real Postgres: the tenant scan, the id-cursor page query and the `::vector` update run against
 * the real `desk_memories` table. The embedder is a fake that returns a 1536-wide vector, so no provider is called.
 * Skipped when DATABASE_URL is unset or names no usable database (unreachable, login refused, no such database, not
 * migrated). It creates a tenant and a Desk agent of its own and limits the run to that tenant, so no other row in
 * the database is touched; all of it is deleted in afterAll.
 */
// No default: the spec writes rows, so it runs only against a database someone named.
const DATABASE_URL = process.env.DATABASE_URL;
const PREFIX = 'reembed-spec ';
const TENANT_KEY = 'reembed-integration-spec';
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

function isNoDatabase(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  return code !== undefined && NO_DATABASE_CODES.has(code);
}

describe('DeskMemoryReembedService (integration)', () => {
  let prisma: PrismaClient;
  let pool: pg.Pool;
  let usable = false;
  let tenantId: number;
  const ids = [
    '00000000-0000-7000-8000-0000000e0001',
    '00000000-0000-7000-8000-0000000e0002',
    '00000000-0000-7000-8000-0000000e0003',
  ];

  beforeAll(async () => {
    if (!DATABASE_URL) {
      console.warn('desk-memory-reembed.integration: DATABASE_URL is unset — skipping');
      return;
    }
    try {
      pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
      prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
      await cleanUp();
      const tenant = await prisma.tenant.create({ data: { tenantId: TENANT_KEY, companyName: 'Re-embed spec' } });
      tenantId = tenant.id;
      const agent = await prisma.deskAgent.create({
        data: { tenantId, key: 'reembed-spec', name: 'Re-embed spec', systemPromptKey: 'reembed-spec' },
      });
      for (const [i, id] of ids.entries()) {
        await prisma.deskMemory.create({
          data: { id, tenantId, agentId: agent.id, scope: 'PLAYBOOK', polarity: 'REINFORCE', content: `${PREFIX}${i}` },
        });
      }
      // The third already has a vector of its own: the run must leave it alone.
      await prisma.$executeRawUnsafe(
        `UPDATE desk_memories SET content_embedding = $1::vector WHERE id = $2::uuid`,
        `[${new Array(1536).fill(0.5).join(',')}]`,
        ids[2],
      );
      usable = true;
    } catch (err) {
      if (!isNoDatabase(err)) throw err;
      console.warn(`desk-memory-reembed.integration: no usable database (${(err as Error).message}) — skipping`);
    }
  }, 30_000);

  async function cleanUp(): Promise<void> {
    await prisma.deskMemory.deleteMany({ where: { id: { in: ids } } });
    await prisma.deskAgent.deleteMany({ where: { tenant: { tenantId: TENANT_KEY } } });
    await prisma.tenant.deleteMany({ where: { tenantId: TENANT_KEY } });
  }

  afterAll(async () => {
    if (usable) await cleanUp();
    await prisma?.$disconnect();
    await pool?.end();
  });

  it('fills every null vector of the tenant, page by page, and leaves an existing vector alone', async () => {
    if (!usable) return;
    const embedder = {
      embedBatch: jest.fn((texts: string[]) => Promise.resolve(texts.map(() => new Array(1536).fill(0.25)))),
    };
    const service = new DeskMemoryReembedService(prisma as never, embedder as never);
    service.batchSize = 1;

    const summary = await service.reembedAll({ tenantIds: [tenantId] });

    expect(summary).toEqual({ tenants: 1, reembedded: 2, skipped: [], failed: [] });
    const rows = await prisma.$queryRawUnsafe<{ id: string; first: number | null }[]>(
      `SELECT id::text, (content_embedding::real[])[1] AS first FROM desk_memories WHERE id = ANY($1::uuid[]) ORDER BY id`,
      ids,
    );
    expect(rows.map((r) => r.first)).toEqual([0.25, 0.25, 0.5]);
    const calls = embedder.embedBatch.mock.calls;
    expect(calls.map((c) => c[0])).toEqual([[`${PREFIX}0`], [`${PREFIX}1`]]);
    expect(calls.every((c) => c[1].tenantId === tenantId && c[2] === 'document')).toBe(true);
  });
});

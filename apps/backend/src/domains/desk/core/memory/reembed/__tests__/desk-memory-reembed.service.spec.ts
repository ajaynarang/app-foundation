import { DeskMemoryReembedService } from '../desk-memory-reembed.service';
import { AiNotConfigured } from '../../../../../ai/routing/ai-not-configured.error';
import { ZeroRetentionUnavailable } from '../../../../../ai/infrastructure/redaction/zero-retention-unavailable.error';

interface SqlObject {
  sql: string;
  values: unknown[];
}

/** A `Prisma.sql` object (passed whole) as opposed to a tagged-template call (strings, then values). */
function isSqlObject(value: unknown): value is SqlObject {
  return typeof value === 'object' && value !== null && 'sql' in value && 'values' in value;
}

/** The SQL text of a `$queryRaw` / `$executeRaw` call, parameters as `?`. */
function sqlOf(call: unknown[]): string {
  const [first] = call;
  return isSqlObject(first) ? first.sql : (first as TemplateStringsArray).join('?');
}

function valuesOf(call: unknown[]): unknown[] {
  const [first] = call;
  return isSqlObject(first) ? first.values : call.slice(1);
}

interface Row {
  id: string;
  tenant_id: number;
  content: string;
  embedded: boolean;
}

/**
 * A tiny in-memory `desk_memories`: the three statements the service sends (tenants with a null vector, the next
 * page of a tenant's null rows after a cursor, the vector update) are answered from `rows`.
 */
function fakePrisma(rows: Row[]) {
  const updates: { id: string; vector: string }[] = [];
  const $queryRaw = jest.fn((...call: unknown[]) => {
    const sql = sqlOf(call);
    const values = valuesOf(call);
    if (sql.includes('DISTINCT tenant_id')) {
      const only = values as number[];
      const tenants = [...new Set(rows.filter((r) => !r.embedded).map((r) => r.tenant_id))]
        .filter((t) => only.length === 0 || only.includes(t))
        .sort((a, b) => a - b);
      return Promise.resolve(tenants.map((tenant_id) => ({ tenant_id })));
    }
    const [tenantId] = values as [number];
    const cursor = values.length > 2 ? (values[1] as string) : null;
    const limit = values[values.length - 1] as number;
    const page = rows
      .filter((r) => r.tenant_id === tenantId && !r.embedded && (cursor === null || r.id > cursor))
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, limit)
      .map(({ id, content }) => ({ id, content }));
    return Promise.resolve(page);
  });
  const $executeRaw = jest.fn((...call: unknown[]) => {
    const values = valuesOf(call);
    const [vector, id] = values as [string, string];
    const row = rows.find((r) => r.id === id && !r.embedded);
    if (row) row.embedded = true;
    updates.push({ id, vector });
    return Promise.resolve(row ? 1 : 0);
  });
  return { $queryRaw, $executeRaw, updates };
}

const memory = (tenant: number, n: number, embedded = false): Row => ({
  id: `0000000${tenant}-0000-7000-8000-${String(n).padStart(12, '0')}`,
  tenant_id: tenant,
  content: `memory ${tenant}.${n}`,
  embedded,
});

describe('DeskMemoryReembedService', () => {
  let embedder: { embedBatch: jest.Mock };

  beforeEach(() => {
    embedder = {
      embedBatch: jest.fn((texts: string[]) => Promise.resolve(texts.map(() => new Array(1536).fill(0.1)))),
    };
  });

  it("re-embeds every row with a null vector, tenant by tenant, on each tenant's own route as documents", async () => {
    const rows = [memory(1, 1), memory(1, 2), memory(2, 1), memory(2, 2, true)];
    const prisma = fakePrisma(rows);
    const service = new DeskMemoryReembedService(prisma as never, embedder as never);

    const summary = await service.reembedAll();

    expect(summary).toEqual({ tenants: 2, reembedded: 3, skipped: [], failed: [] });
    expect(rows.every((r) => r.embedded)).toBe(true);
    expect(embedder.embedBatch.mock.calls.map((c) => [c[1].tenantId, c[2]])).toEqual([
      [1, 'document'],
      [2, 'document'],
    ]);
    expect(embedder.embedBatch.mock.calls[0][1]).toMatchObject({ surface: 'EMBEDDING' });
    expect(embedder.embedBatch.mock.calls[0][0]).toEqual(['memory 1.1', 'memory 1.2']);
  });

  it('pages through a tenant by id, so every row is embedded once', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => memory(1, i + 1));
    const prisma = fakePrisma(rows);
    const service = new DeskMemoryReembedService(prisma as never, embedder as never);
    service.batchSize = 2;

    const summary = await service.reembedAll();

    expect(summary.reembedded).toBe(5);
    expect(embedder.embedBatch.mock.calls.map((c) => c[0].length)).toEqual([2, 2, 1]);
    expect(new Set(prisma.updates.map((u) => u.id)).size).toBe(5);
  });

  it('only fills a vector that is still null, so a memory written meanwhile keeps its own', async () => {
    const prisma = fakePrisma([memory(1, 1)]);
    const service = new DeskMemoryReembedService(prisma as never, embedder as never);

    await service.reembedAll();

    expect(sqlOf(prisma.$executeRaw.mock.calls[0])).toMatch(/content_embedding IS NULL/);
  });

  it('skips a tenant its route refuses (zero retention, not configured), names the reason, and goes on', async () => {
    const rows = [memory(1, 1), memory(2, 1), memory(3, 1)];
    const prisma = fakePrisma(rows);
    embedder.embedBatch.mockImplementation((texts: string[], ctx: { tenantId: number }) => {
      if (ctx.tenantId === 1) return Promise.reject(new ZeroRetentionUnavailable('embedding'));
      if (ctx.tenantId === 2) return Promise.reject(new AiNotConfigured('embedding'));
      return Promise.resolve(texts.map(() => new Array(1536).fill(0.1)));
    });
    const service = new DeskMemoryReembedService(prisma as never, embedder as never);

    const summary = await service.reembedAll();

    expect(summary.reembedded).toBe(1);
    expect(summary.skipped).toEqual([
      { tenantId: 1, reason: 'ZeroRetentionUnavailable' },
      { tenantId: 2, reason: 'AiNotConfigured' },
    ]);
    expect(summary.failed).toEqual([]);
    expect(rows.map((r) => r.embedded)).toEqual([false, false, true]);
  });

  it('reports a tenant that failed for another reason as failed, keeps what it embedded, and goes on', async () => {
    const rows = [memory(1, 1), memory(1, 2), memory(2, 1)];
    const prisma = fakePrisma(rows);
    let calls = 0;
    embedder.embedBatch.mockImplementation((texts: string[]) => {
      calls += 1;
      if (calls === 2) return Promise.reject(new Error('provider down'));
      return Promise.resolve(texts.map(() => new Array(1536).fill(0.1)));
    });
    const service = new DeskMemoryReembedService(prisma as never, embedder as never);
    service.batchSize = 1;

    const summary = await service.reembedAll();

    expect(summary.failed).toEqual([{ tenantId: 1, reason: 'Error: provider down' }]);
    expect(rows.map((r) => r.embedded)).toEqual([true, false, true]);
    expect(summary.reembedded).toBe(2);
  });

  it('touches only the tenants it is limited to', async () => {
    const rows = [memory(1, 1), memory(2, 1)];
    const service = new DeskMemoryReembedService(fakePrisma(rows) as never, embedder as never);

    const summary = await service.reembedAll({ tenantIds: [2] });

    expect(summary.tenants).toBe(1);
    expect(rows.map((r) => r.embedded)).toEqual([false, true]);
  });

  it('is a no-op when every row already has a vector (safe to re-run)', async () => {
    const prisma = fakePrisma([memory(1, 1, true)]);
    const service = new DeskMemoryReembedService(prisma as never, embedder as never);

    await expect(service.reembedAll()).resolves.toEqual({ tenants: 0, reembedded: 0, skipped: [], failed: [] });
    expect(embedder.embedBatch).not.toHaveBeenCalled();
  });
});

import { PrismaClient } from '@appshore/db';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { SearchIndexerService } from '../indexing/search-indexer.service';
import { SearchQueryService } from '../query/search-query.service';
import { SearchRebuildService } from '../rebuild/search-rebuild.service';
import type { SearchSubject, SearchSubjectContent } from '../search-subject';

/**
 * The search index on a real Postgres: the indexer's insert (pgvector, the generated tsvector column), the query's
 * two ranked lists with their positional parameters, tenant isolation, and the rebuild's clean-up all run against
 * the real `search_chunks` table.
 *
 * Skipped when DATABASE_URL is unset or names no usable database. It creates two tenants of its own and deletes
 * them (and with them every row it wrote) in afterAll.
 */
// No default: the spec writes rows, so it runs only against a database someone named.
const DATABASE_URL = process.env.DATABASE_URL;
const KEY = 'search-index-spec';
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
const isNoDatabase = (err: unknown): boolean => NO_DATABASE_CODES.has((err as { code?: string }).code ?? '');
/** A unit vector along one axis: two texts on the same axis are identical to pgvector, on different axes unrelated. */
const axis = (i: number): number[] => Array.from({ length: 1536 }, (_, k) => (k === i ? 1 : 0));

describe('search index (Postgres)', () => {
  let prisma: PrismaClient;
  let pool: pg.Pool;
  let usable = false;
  let tenantA: number;
  let tenantB: number;
  const notes = new Map<string, SearchSubjectContent | null>();
  const subject: SearchSubject = {
    type: 'spec-note',
    events: [],
    subjectIdsFor: () => [],
    load: async (tenantId, id) => notes.get(`${tenantId}:${id}`) ?? null,
    listIds: async (tenantId) =>
      [...notes.keys()].filter((k) => k.startsWith(`${tenantId}:`) && notes.get(k)).map((k) => k.split(':')[1]),
  };
  const embedder = { embedBatch: jest.fn(), embedText: jest.fn() };
  const routes = { resolve: jest.fn().mockResolvedValue({ embeddingModelId: () => 'spec-embed-v1' }) };
  let indexer: SearchIndexerService;
  let query: SearchQueryService;
  let rebuild: SearchRebuildService;

  beforeAll(async () => {
    if (!DATABASE_URL) {
      console.warn('search-index.integration: DATABASE_URL is unset — skipping');
      return;
    }
    try {
      pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
      prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
      await prisma.tenant.deleteMany({ where: { tenantId: { startsWith: KEY } } });
      tenantA = (await prisma.tenant.create({ data: { tenantId: `${KEY}-a`, companyName: 'Search spec A' } })).id;
      tenantB = (await prisma.tenant.create({ data: { tenantId: `${KEY}-b`, companyName: 'Search spec B' } })).id;
      usable = true;
    } catch (err) {
      if (!isNoDatabase(err)) throw err;
      console.warn(`search-index.integration: no usable database (${(err as Error).message}) — skipping`);
      return;
    }
    indexer = new SearchIndexerService(prisma as never, embedder as never, routes as never, [subject]);
    query = new SearchQueryService(prisma as never, embedder as never);
    rebuild = new SearchRebuildService(prisma as never, indexer, [subject]);
  }, 30_000);

  afterAll(async () => {
    if (usable) await prisma.tenant.deleteMany({ where: { tenantId: { startsWith: KEY } } });
    await prisma?.$disconnect();
    await pool?.end();
  });

  beforeEach(() => {
    embedder.embedBatch.mockReset();
    embedder.embedText.mockReset();
  });

  const rowsOf = (tenantId: number, subjectId: string) =>
    prisma.$queryRawUnsafe<{ chunk_ix: number; title: string; embedding_model: string | null; has_vector: boolean }[]>(
      `SELECT chunk_ix, title, embedding_model, embedding IS NOT NULL AS has_vector FROM search_chunks
        WHERE tenant_id = $1 AND subject_id = $2 ORDER BY chunk_ix`,
      tenantId,
      subjectId,
    );

  it('indexes a record with vectors, finds it by meaning and by keyword, and never from another tenant', async () => {
    if (!usable) return;
    notes.set(`${tenantA}:n1`, { title: 'Refund policy', text: 'Refunds settle in five working days.', href: '/n/1' });
    notes.set(`${tenantA}:n2`, { title: 'Shipping', text: 'Parcels leave the warehouse on weekdays.' });
    notes.set(`${tenantB}:n1`, { title: 'Refund policy (B)', text: 'Refunds settle in five working days.' });
    embedder.embedBatch.mockImplementation(async (texts: string[]) =>
      texts.map((t) => axis(t.includes('Refund') ? 0 : 1)),
    );
    expect(await indexer.reindex(tenantA, 'spec-note', 'n1')).toBe('indexed');
    expect(await indexer.reindex(tenantA, 'spec-note', 'n2')).toBe('indexed');
    expect(await indexer.reindex(tenantB, 'spec-note', 'n1')).toBe('indexed');
    expect(await rowsOf(tenantA, 'n1')).toEqual([
      { chunk_ix: 0, title: 'Refund policy', embedding_model: 'spec-embed-v1', has_vector: true },
    ]);

    // By meaning: the query shares no word with the note, only its vector.
    embedder.embedText.mockResolvedValue(axis(0));
    const byMeaning = await query.retrieve(tenantA, 'zzzz qqqq');
    expect(byMeaning.map((h) => [h.subjectId, h.title, h.href])).toEqual([['n1', 'Refund policy', '/n/1']]);
    expect(embedder.embedText).toHaveBeenCalledWith('zzzz qqqq', { tenantId: tenantA, surface: 'EMBEDDING' }, 'query');

    // By keyword alone when the query cannot be embedded; stemming matches "parcel" to "Parcels".
    embedder.embedText.mockRejectedValue(new Error('no route'));
    const byKeyword = await query.retrieve(tenantA, 'where is my parcel?');
    expect(byKeyword.map((h) => h.subjectId)).toEqual(['n2']);
    expect(byKeyword[0].content).toBe('Shipping\n\nParcels leave the warehouse on weekdays.');

    const other = await query.retrieve(tenantB, 'refunds');
    expect(other.map((h) => h.title)).toEqual(['Refund policy (B)']);
    expect(await query.retrieve(tenantA, 'refunds', { types: ['no-such-type'] })).toEqual([]);
    expect(await query.retrieve(tenantA, 'it\'s a "quoted" & odd: query!')).toEqual([]);
  });

  it('stores chunks without vectors when embedding fails, replaces them on the next run, and drops a gone record', async () => {
    if (!usable) return;
    const long = Array.from({ length: 6 }, (_, i) => `## Part ${i}\n\n${'Quokka facts. '.repeat(60)}`).join('\n\n');
    notes.set(`${tenantA}:n3`, { title: 'Quokkas', text: long });
    embedder.embedBatch.mockRejectedValue(new Error('provider down'));
    expect(await indexer.reindex(tenantA, 'spec-note', 'n3')).toBe('indexed-without-vectors');
    const first = await rowsOf(tenantA, 'n3');
    expect(first.length).toBeGreaterThan(1);
    expect(first.every((r) => !r.has_vector && r.embedding_model === null)).toBe(true);

    embedder.embedText.mockRejectedValue(new Error('provider down'));
    const hits = await query.retrieve(tenantA, 'quokka', { limit: 10 });
    expect(hits.length).toBe(2); // at most two chunks of one record
    expect((await query.retrieve(tenantA, 'quokka', { limit: 10, maxPerRecord: 1 })).length).toBe(1);

    notes.set(`${tenantA}:n3`, { title: 'Quokkas', text: 'Short now.' });
    embedder.embedBatch.mockImplementation(async (texts: string[]) => texts.map(() => axis(2)));
    expect(await indexer.reindex(tenantA, 'spec-note', 'n3')).toBe('indexed');
    expect(await rowsOf(tenantA, 'n3')).toEqual([
      { chunk_ix: 0, title: 'Quokkas', embedding_model: 'spec-embed-v1', has_vector: true },
    ]);

    notes.set(`${tenantA}:n3`, null);
    expect(await indexer.reindex(tenantA, 'spec-note', 'n3')).toBe('removed');
    expect(await rowsOf(tenantA, 'n3')).toEqual([]);
    expect(await indexer.reindex(tenantA, 'no-such-type', 'n3')).toBe('unknown-subject');
  });

  it('a rebuild writes every listed record again and removes what is gone or no longer registered', async () => {
    if (!usable) return;
    notes.clear();
    notes.set(`${tenantA}:keep`, { title: 'Kept', text: 'Still here.' });
    embedder.embedBatch.mockImplementation(async (texts: string[]) => texts.map(() => axis(3)));
    const stale = (type: string, id: string) =>
      prisma.$executeRawUnsafe(
        `INSERT INTO search_chunks (tenant_id, subject_type, subject_id, chunk_ix, title, content)
         VALUES ($1, $2, $3, 0, 'Stale', 'stale')`,
        tenantA,
        type,
        id,
      );
    await prisma.searchChunk.deleteMany({ where: { tenantId: tenantA } });
    await stale('spec-note', 'deleted-record');
    await stale('retired-type', 'x');

    const summary = await rebuild.rebuild({ tenantIds: [tenantA] });
    expect(summary).toEqual({ tenants: 1, indexed: 1, withoutVectors: 0, removed: 2, failed: [] });
    const left = await prisma.searchChunk.findMany({ where: { tenantId: tenantA }, select: { subjectId: true } });
    expect(left).toEqual([{ subjectId: 'keep' }]);
  });
});

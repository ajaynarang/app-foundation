import type { DomainEvent } from '@appshore/kernel/infrastructure/events/domain-event';
import { SearchIndexListener } from '../indexing/search-index.listener';
import { SearchIndexJobHandler } from '../indexing/search-index.handler';
import { SearchIndexerService } from '../indexing/search-indexer.service';
import { SearchQueryService } from '../query/search-query.service';
import { SearchRebuildService } from '../rebuild/search-rebuild.service';
import { formatRebuildSummary, parseTenantIds } from '../rebuild/search-rebuild.command';
import { assertSubjects, type SearchSubject } from '../search-subject';
import { RecordSearchTool } from '../../mcp/tools/record-search.tool';

const subject = (over: Partial<SearchSubject> = {}): SearchSubject => ({
  type: 'order',
  events: ['app.order.updated'],
  subjectIdsFor: (event) => [(event.data as { publicId: string }).publicId],
  load: jest.fn().mockResolvedValue(null),
  listIds: jest.fn().mockResolvedValue([]),
  ...over,
});
const event = (over: Partial<DomainEvent> = {}): DomainEvent =>
  ({
    id: 'evt_1',
    event: 'app.order.updated',
    tenantId: '7',
    correlationId: 'corr_1',
    data: { publicId: 'ord_1' },
    ...over,
  }) as DomainEvent;

describe('assertSubjects', () => {
  it('refuses a type the column cannot hold and a type registered twice', () => {
    expect(() => assertSubjects([subject(), subject({ type: 'ticket' })])).not.toThrow();
    expect(() => assertSubjects([subject({ type: 'Order' })])).toThrow(/lower-case kebab/);
    expect(() => assertSubjects([subject({ type: 'x'.repeat(51) })])).toThrow(/at most 50/);
    expect(() => assertSubjects([subject(), subject()])).toThrow(/"order" is registered twice/);
  });
});

describe('SearchIndexListener', () => {
  const queue = { add: jest.fn() };
  beforeEach(() => queue.add.mockReset().mockResolvedValue(undefined));

  it('turns an event a subject listens for into one job per record, keyed by the event and the record', async () => {
    const both = subject({ type: 'invoice', subjectIdsFor: () => ['inv_1', 'inv_1', 'inv_2'] });
    const listener = new SearchIndexListener(queue as never, [subject(), both]);
    await listener.handleDomainEvent(event());
    expect(queue.add).toHaveBeenCalledTimes(3);
    const [name, envelope, options] = queue.add.mock.calls[0];
    expect(name).toBe('search-index');
    expect(envelope).toMatchObject({
      tenantId: '7',
      correlationId: 'corr_1',
      causationId: 'evt_1',
      payload: { tenantId: 7, subjectType: 'order', subjectId: 'ord_1' },
      metadata: { source: 'event' },
    });
    expect(options).toMatchObject({ jobId: 'search-index-evt_1-order-ord_1', attempts: 3 });
    expect(queue.add.mock.calls.map((c) => c[2].jobId)).toEqual([
      'search-index-evt_1-order-ord_1',
      'search-index-evt_1-invoice-inv_1',
      'search-index-evt_1-invoice-inv_2',
    ]);
  });

  it('ignores other events and an event with no tenant, and with no subject registered listens for nothing', async () => {
    const listener = new SearchIndexListener(queue as never, [subject()]);
    await listener.handleDomainEvent(event({ event: 'app.user.created' }));
    await listener.handleDomainEvent(event({ tenantId: 'platform' }));
    await new SearchIndexListener(queue as never, []).handleDomainEvent(event());
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('never fails the flow that raised the event: a failed enqueue and a subject that throws are logged', async () => {
    queue.add.mockRejectedValueOnce(new Error('redis down'));
    const broken = subject({
      type: 'broken',
      subjectIdsFor: () => {
        throw new Error('no publicId');
      },
    });
    const listener = new SearchIndexListener(queue as never, [broken, subject(), subject({ type: 'ticket' })]);
    await expect(listener.handleDomainEvent(event())).resolves.toBeUndefined();
    expect(queue.add).toHaveBeenCalledTimes(2);
  });
});

describe('SearchIndexJobHandler', () => {
  it('owns the search-index job and re-reads the one record its payload names', async () => {
    const indexer = { reindex: jest.fn().mockResolvedValue('indexed') };
    const handler = new SearchIndexJobHandler(indexer as never);
    expect(handler.jobNames).toEqual(['search-index']);
    const job = { data: { payload: { tenantId: 7, subjectType: 'order', subjectId: 'ord_1' } } };
    await expect(handler.run(job as never)).resolves.toBe('indexed');
    expect(indexer.reindex).toHaveBeenCalledWith(7, 'order', 'ord_1');
  });
});

describe('SearchIndexerService', () => {
  const prisma = { searchChunk: { deleteMany: jest.fn() }, $transaction: jest.fn() };
  const embeddings = { embedBatch: jest.fn() };
  const routes = { resolve: jest.fn() };
  beforeEach(() => jest.clearAllMocks());

  it('drops the rows of a record that must not be found, and writes nothing for an unknown subject', async () => {
    const order = subject();
    const indexer = new SearchIndexerService(prisma as never, embeddings as never, routes as never, [order]);
    await expect(indexer.reindex(7, 'order', 'ord_1')).resolves.toBe('removed');
    expect(order.load).toHaveBeenCalledWith(7, 'ord_1');
    expect(prisma.searchChunk.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 7, subjectType: 'order', subjectId: 'ord_1' },
    });

    (order.load as jest.Mock).mockResolvedValue({ title: 'Empty', text: '   ' });
    await expect(indexer.reindex(7, 'order', 'ord_2')).resolves.toBe('removed');
    await expect(indexer.reindex(7, 'ticket', 't_1')).resolves.toBe('unknown-subject');
    await expect(indexer.reindex(7, 'order', 'x'.repeat(101))).resolves.toBe('unknown-subject');
    expect(embeddings.embedBatch).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('embeds as documents on the tenant route, in batches, and caps a very long record', async () => {
    const text = Array.from({ length: 80 }, (_, i) => `## S${i}\n\nBody ${i}.`).join('\n\n');
    const order = subject({ load: jest.fn().mockResolvedValue({ title: 'Long', text }) });
    embeddings.embedBatch.mockImplementation(async (texts: string[]) => texts.map(() => [0]));
    routes.resolve.mockResolvedValue({ embeddingModelId: () => 'm' });
    prisma.$transaction.mockResolvedValue(undefined);
    const indexer = new SearchIndexerService(prisma as never, embeddings as never, routes as never, [order]);
    await expect(indexer.reindex(7, 'order', 'ord_1')).resolves.toBe('indexed');
    expect(embeddings.embedBatch.mock.calls.map((c) => c[0].length)).toEqual([48, 2]);
    expect(embeddings.embedBatch.mock.calls[0].slice(1)).toEqual([{ tenantId: 7, surface: 'EMBEDDING' }, 'document']);
    expect(embeddings.embedBatch.mock.calls[0][0][0]).toBe('Long › S0\n\nBody 0.');
  });
});

describe('SearchQueryService', () => {
  const prisma = { $queryRawUnsafe: jest.fn() };
  const embeddings = { embedText: jest.fn() };
  const service = new SearchQueryService(prisma as never, embeddings as never);
  beforeEach(() => jest.clearAllMocks());

  it('answers nothing for a blank query or only unusable types, without touching the database', async () => {
    expect(await service.retrieve(7, '   ')).toEqual([]);
    expect(await service.retrieve(7, 'refunds', { types: ["x'; DROP"] })).toEqual([]);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('scopes both lists to the tenant with positional parameters, clamps the limit, and fuses by rank', async () => {
    embeddings.embedText.mockResolvedValue([0.5]);
    const row = (id: number, subjectId: string, vector: number | null, textRank: number | null) => ({
      id,
      subject_type: 'order',
      subject_id: subjectId,
      title: `T${id}`,
      href: null,
      section: null,
      content: `c${id}`,
      vector_rank: vector === null ? null : BigInt(vector),
      vector_similarity: vector === null ? null : '0.9',
      text_rank: textRank === null ? null : BigInt(textRank),
    });
    prisma.$queryRawUnsafe.mockResolvedValue([
      row(1, 'a', 2, null),
      row(2, 'b', 1, 1),
      row(3, 'b', 3, 2),
      row(4, 'b', 4, 3),
    ]);
    const hits = await service.retrieve(7, 'late refund', { types: ['order', 'BAD TYPE'], limit: 999, userId: 3 });
    expect(hits.map((h) => h.title)).toEqual(['T2', 'T3', 'T1']); // both lists first; two chunks of record b at most
    expect(hits[0].score).toBe(1);

    const [sql, ...params] = prisma.$queryRawUnsafe.mock.calls[0] as [string, ...unknown[]];
    expect(params).toEqual([7, ['order'], 40, '[0.5]', 'late | refund', 7]);
    expect(sql).not.toMatch(/late|refund/);
    expect(sql.match(/tenant_id = \$1/g)?.length).toBe(2);
    expect(sql).toMatch(/f\.tenant_id = \$6/);
    expect(embeddings.embedText).toHaveBeenCalledWith(
      'late refund',
      { tenantId: 7, userId: 3, surface: 'EMBEDDING' },
      'query',
    );
  });

  it('answers from full-text alone when the query cannot be embedded', async () => {
    embeddings.embedText.mockRejectedValue(new Error('ZeroRetentionUnavailable'));
    prisma.$queryRawUnsafe.mockResolvedValue([]);
    await expect(service.retrieve(7, 'refund')).resolves.toEqual([]);
    const [sql, ...params] = prisma.$queryRawUnsafe.mock.calls[0] as [string, ...unknown[]];
    expect(params).toEqual([7, 40, 'refund', 7]);
    expect(sql).toMatch(/WITH vec AS \(SELECT NULL::int AS id/);
  });
});

describe('SearchRebuildService and its command', () => {
  it('keeps going past a record that fails and reports it', async () => {
    const prisma = {
      tenant: { findMany: jest.fn().mockResolvedValue([{ id: 7 }]) },
      searchChunk: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }), groupBy: jest.fn().mockResolvedValue([]) },
    };
    const indexer = {
      reindex: jest
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce('indexed-without-vectors')
        .mockResolvedValueOnce('removed'),
    };
    const order = subject({ listIds: jest.fn().mockResolvedValue(['a', 'b', 'c', 'a']) });
    const summary = await new SearchRebuildService(prisma as never, indexer as never, [order]).rebuild();
    expect(summary).toEqual({
      tenants: 1,
      indexed: 0,
      withoutVectors: 1,
      removed: 1,
      failed: [{ tenantId: 7, subjectType: 'order', subjectId: 'a', reason: 'boom' }],
    });
    expect(prisma.tenant.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
    expect(formatRebuildSummary(summary)).toMatch(
      /1 tenant\(s\), 0 record\(s\) indexed, 1 stored without vectors, 1 removed, 1 failed\n.*no embedding route.*\n {2}failed: tenant 7 order a: boom/,
    );
  });

  it('reads --tenant flags and refuses one without an id', () => {
    expect(parseTenantIds([])).toEqual([]);
    expect(parseTenantIds(['--tenant', '3', '--tenant', '9'])).toEqual([3, 9]);
    expect(() => parseTenantIds(['--tenant', 'abc'])).toThrow(/--tenant needs a tenant id, got "abc"/);
    expect(() => parseTenantIds(['--tenant'])).toThrow(/--tenant needs a tenant id/);
  });
});

describe('RecordSearchTool', () => {
  it("searches the caller's tenant only, and answers nothing without one", async () => {
    const search = {
      retrieve: jest.fn().mockResolvedValue([
        {
          subjectType: 'order',
          subjectId: 'ord_1',
          title: 'Order 1',
          href: '/o/1',
          section: null,
          content: 'c',
          score: 0.5,
        },
      ]),
    };
    const tool = new RecordSearchTool(search as never);
    expect(await tool.searchRecords({ query: 'late' })).toEqual({ results: [], totalResults: 0 });
    expect(search.retrieve).not.toHaveBeenCalled();
    const out = await tool.searchRecords({ query: 'late', types: ['order'], _tenantId: 7 });
    expect(search.retrieve).toHaveBeenCalledWith(7, 'late', { types: ['order'], limit: 5 });
    expect(out).toEqual({
      results: [
        { type: 'order', id: 'ord_1', title: 'Order 1', section: null, content: 'c', href: '/o/1', relevance: 0.5 },
      ],
      totalResults: 1,
    });
  });
});

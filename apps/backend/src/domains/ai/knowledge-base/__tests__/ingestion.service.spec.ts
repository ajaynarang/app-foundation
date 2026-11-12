import { IngestionService, contentHash } from '../ingestion.service';
import { loadAllEntries, type KnowledgeEntry } from '../content/content-loader';
import { AiNotConfigured } from '../../routing/ai-not-configured.error';

jest.mock('@appshore/kernel/shared/utils/id-generator', () => ({
  generateId: jest.fn().mockReturnValue('doc_mock_id'),
}));

jest.mock('../content/content-loader', () => ({ loadAllEntries: jest.fn() }));

const entry = (sourcePath: string, content: string, title = sourcePath): KnowledgeEntry => ({
  title,
  content,
  documentType: 'guide',
  audience: 'all',
  category: 'getting-started',
  keywords: ['platform'],
  sourcePath,
});

const WELCOME = entry('knowledge-base/getting-started/welcome.md', 'The platform is a starter.', 'Welcome');
const INVITES = entry('knowledge-base/workspaces/invites.md', '## Sending\n\nOwners invite by email.', 'Invites');

type Stored = { source_path: string; content_hash: string | null; missing_vectors: boolean };

describe('IngestionService', () => {
  let service: IngestionService;
  let mockPrisma: any;
  let tx: any;
  let mockEmbedding: any;

  const stored = (rows: Stored[]) => mockPrisma.$queryRaw.mockResolvedValue(rows);
  const current = (e: KnowledgeEntry, missingVectors = false): Stored => ({
    source_path: e.sourcePath,
    content_hash: contentHash(e),
    missing_vectors: missingVectors,
  });

  beforeEach(() => {
    tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      knowledgeDocument: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
    };
    mockPrisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      knowledgeDocument: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      $transaction: jest.fn().mockImplementation(async (fn: (t: unknown) => Promise<void>) => fn(tx)),
    };
    mockEmbedding = {
      embedForPlatform: jest.fn().mockImplementation((texts: string[]) => Promise.resolve(texts.map(() => [0.1, 0.2]))),
    };
    (loadAllEntries as jest.Mock).mockReturnValue([WELCOME, INVITES]);

    service = new IngestionService(mockPrisma, mockEmbedding);
  });

  it('adds every file on a first run, embedding "Title › Section" chunks on the platform route as documents', async () => {
    const result = await service.ingestAll();

    expect(result).toMatchObject({
      added: [WELCOME.sourcePath, INVITES.sourcePath],
      updated: [],
      chunkCount: 2,
      embedded: true,
    });
    expect(mockEmbedding.embedForPlatform).toHaveBeenCalledWith(
      ['Welcome\n\nThe platform is a starter.', 'Invites › Sending\n\nOwners invite by email.'],
      'document',
    );
    expect(tx.knowledgeDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourcePath: INVITES.sourcePath,
          section: 'Sending',
          contentHash: contentHash(INVITES),
        }),
      }),
    );
    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it('skips unchanged files and re-embeds only changed ones', async () => {
    stored([current(WELCOME), { source_path: INVITES.sourcePath, content_hash: 'stale', missing_vectors: false }]);

    const result = await service.ingestAll();

    expect(result.unchanged).toBe(1);
    expect(result.updated).toEqual([INVITES.sourcePath]);
    expect(mockEmbedding.embedForPlatform.mock.calls[0][0]).toHaveLength(1);
    expect(tx.knowledgeDocument.deleteMany).toHaveBeenCalledWith({ where: { sourcePath: INVITES.sourcePath } });
  });

  it('does not call the embedder or open a transaction when nothing changed', async () => {
    stored([current(WELCOME), current(INVITES)]);

    const result = await service.ingestAll();

    expect(result.unchanged).toBe(2);
    expect(mockEmbedding.embedForPlatform).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('re-embeds everything with force', async () => {
    stored([current(WELCOME)]);

    const result = await service.ingestAll({ force: true });

    expect(result.updated).toEqual([WELCOME.sourcePath]);
    expect(result.added).toEqual([INVITES.sourcePath]);
  });

  it('removes deleted files and the legacy rows the migration marked, and never touches a row with no source path', async () => {
    stored([
      current(WELCOME),
      current(INVITES),
      { source_path: 'knowledge-base/old/gone.md', content_hash: 'x', missing_vectors: false },
      { source_path: 'legacy:doc_abc', content_hash: null, missing_vectors: true },
    ]);

    const result = await service.ingestAll();

    expect(result.removed).toEqual(['knowledge-base/old/gone.md', 'legacy:doc_abc']);
    expect(mockPrisma.knowledgeDocument.deleteMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.knowledgeDocument.deleteMany).toHaveBeenCalledWith({
      where: { sourcePath: { in: ['knowledge-base/old/gone.md', 'legacy:doc_abc'] } },
    });
    // The stored-file read only ever sees the ingester's own rows.
    expect(String(mockPrisma.$queryRaw.mock.calls[0][0].join('?'))).toContain('source_path IS NOT NULL');
  });

  it('deletes nothing at all when no stored file is gone (a product-inserted row with a null path survives a sync)', async () => {
    await service.ingestAll();

    expect(mockPrisma.knowledgeDocument.deleteMany).not.toHaveBeenCalled();
    for (const call of tx.knowledgeDocument.deleteMany.mock.calls) {
      expect(call[0].where.sourcePath).toEqual(expect.any(String));
    }
  });

  it('removes a stored file that now has no content', async () => {
    const emptied = entry('knowledge-base/faq/emptied.md', '# Only a title');
    (loadAllEntries as jest.Mock).mockReturnValue([emptied]);
    stored([{ source_path: emptied.sourcePath, content_hash: 'old', missing_vectors: false }]);

    const result = await service.ingestAll();

    expect(result.removed).toEqual([emptied.sourcePath]);
    expect(mockPrisma.knowledgeDocument.deleteMany).toHaveBeenCalledWith({
      where: { sourcePath: { in: [emptied.sourcePath] } },
    });
  });

  it('leaves the table untouched when the provider fails (embeds before it writes)', async () => {
    mockEmbedding.embedForPlatform.mockRejectedValue(new Error('insufficient_quota'));

    await expect(service.ingestAll()).rejects.toThrow('insufficient_quota');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.knowledgeDocument.deleteMany).not.toHaveBeenCalled();
  });

  it('locks each file while swapping its chunks', async () => {
    await service.ingestAll();

    // A tagged template call: (strings, ...values). The key is bound, never interpolated into the SQL.
    const locks = tx.$executeRaw.mock.calls.map(([strings, ...values]: [TemplateStringsArray, ...unknown[]]) => ({
      sql: strings.join('$'),
      values,
    }));
    expect(locks).toEqual([
      {
        sql: expect.stringMatching(/^SELECT pg_advisory_xact_lock\(hashtext\(\$\)\)$/),
        values: [`kb:${WELCOME.sourcePath}`],
      },
      {
        sql: expect.stringMatching(/^SELECT pg_advisory_xact_lock\(hashtext\(\$\)\)$/),
        values: [`kb:${INVITES.sourcePath}`],
      },
    ]);

    // Each file's lock is taken inside its transaction before its old chunks are deleted.
    const lockOrder = tx.$executeRaw.mock.invocationCallOrder;
    const deleteOrder = tx.knowledgeDocument.deleteMany.mock.invocationCallOrder;
    expect(deleteOrder).toHaveLength(2);
    expect(lockOrder[0]).toBeLessThan(deleteOrder[0]);
    expect(lockOrder[1]).toBeLessThan(deleteOrder[1]);
    expect(deleteOrder[0]).toBeLessThan(lockOrder[1]);
  });

  describe('with no platform embedding route', () => {
    beforeEach(() => mockEmbedding.embedForPlatform.mockRejectedValue(new AiNotConfigured('embedding')));

    it('stores new chunks without vectors and says so', async () => {
      const result = await service.ingestAll();

      expect(tx.knowledgeDocument.create).toHaveBeenCalledTimes(2);
      expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
      expect(result).toMatchObject({ added: [WELCOME.sourcePath, INVITES.sourcePath], chunkCount: 2, embedded: false });
    });

    it('leaves an unchanged file without vectors alone instead of rewriting it on every run', async () => {
      stored([current(WELCOME, true), current(INVITES, true)]);

      const result = await service.ingestAll();

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(result).toMatchObject({ unchanged: 2, reembedded: [], chunkCount: 0, embedded: false });
    });
  });

  it('re-embeds an unchanged file whose chunks have no vectors once a route exists', async () => {
    stored([current(WELCOME, true), current(INVITES)]);

    const result = await service.ingestAll();

    expect(result).toMatchObject({ reembedded: [WELCOME.sourcePath], updated: [], added: [], unchanged: 1 });
    expect(mockEmbedding.embedForPlatform.mock.calls[0][0]).toEqual(['Welcome\n\nThe platform is a starter.']);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});

describe('contentHash', () => {
  it('changes when content or metadata changes', () => {
    expect(contentHash(WELCOME)).toBe(contentHash({ ...WELCOME }));
    expect(contentHash(WELCOME)).not.toBe(contentHash({ ...WELCOME, content: 'changed' }));
    expect(contentHash(WELCOME)).not.toBe(contentHash({ ...WELCOME, audience: 'admin' }));
  });
});

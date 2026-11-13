import { KnowledgeBaseService } from '../knowledge-base.service';
import { AiNotConfigured } from '../../routing/ai-not-configured.error';
import { AiCredentialFailing } from '../../routing/ai-credential-failing.error';
import { ZeroRetentionUnavailable } from '../../infrastructure/redaction/zero-retention-unavailable.error';

const CTX = { tenantId: 7, surface: 'EMBEDDING' as const };

const row = (overrides: Record<string, unknown> = {}) => ({
  document_id: 'doc_001',
  parent_doc_id: null,
  title: 'Inviting teammates',
  section: 'Roles',
  source_path: 'knowledge-base/workspaces/inviting-teammates.md',
  content: 'Inviting teammates › Roles\n\nOwners choose a role when they invite.',
  document_type: 'guide',
  audience: 'all',
  category: 'workspaces',
  keywords: ['invite'],
  vector_rank: BigInt(1),
  vector_similarity: 0.82,
  text_rank: BigInt(1),
  ...overrides,
});

describe('KnowledgeBaseService', () => {
  let service: KnowledgeBaseService;
  let mockPrisma: any;
  let mockEmbedding: any;

  const sqlOf = (call = 0): string => mockPrisma.$queryRawUnsafe.mock.calls[call][0];
  const isVectorQuery = (sql: string) => sql.includes('embedding <=>');

  beforeEach(() => {
    mockPrisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([row()]),
      knowledgeDocument: { findMany: jest.fn().mockResolvedValue([]) },
    };
    mockEmbedding = {
      embedText: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
      embedForPlatform: jest.fn().mockResolvedValue([new Array(1536).fill(0.1)]),
    };
    service = new KnowledgeBaseService(mockPrisma, mockEmbedding);
  });

  describe('hybridSearch', () => {
    it("returns fused results with source and section, embedding the query on the tenant's route", async () => {
      const results = await service.hybridSearch('How do I invite someone?', { audiences: ['all'], aiContext: CTX });

      expect(mockEmbedding.embedText).toHaveBeenCalledWith('How do I invite someone?', CTX, 'query');
      expect(results).toEqual([
        expect.objectContaining({
          documentId: 'doc_001',
          parentDocId: null,
          section: 'Roles',
          sourcePath: 'knowledge-base/workspaces/inviting-teammates.md',
          similarity: 1,
        }),
      ]);
    });

    it('runs both a vector and an any-term full-text list, every value bound to its own parameter', async () => {
      await service.hybridSearch('pricing', { audiences: ['all'], aiContext: CTX });

      const [sql, ...params] = mockPrisma.$queryRawUnsafe.mock.calls[0];
      expect(params).toContainEqual(['all']);
      expect(params).toContain('pricing');
      const bound = (fragment: RegExp) => params[Number(fragment.exec(sql)?.[1]) - 1];
      expect(String(bound(/embedding <=> \$(\d+)::vector/))).toMatch(/^\[0\.1,/);
      expect(bound(/to_tsvector\('english', \$(\d+)\)/)).toBe('pricing');
      expect(sql).toContain("ts_stat('SELECT content_tsv FROM knowledge_documents')");
      expect(sql).toContain('quote_literal(l.lexeme)');
      expect(bound(/LIMIT \$(\d+)/)).toBe(30);
    });

    it('always keeps a term found in only a few chunks, so full-text works on a small corpus', async () => {
      await service.hybridSearch('pricing', { audiences: ['all'] });
      expect(sqlOf()).toMatch(/st\.ndoc <= GREATEST\(0\.3 \* \(SELECT count\(\*\) FROM knowledge_documents\),\s+3\)/);
    });

    it('skips the full-text list when the query has no searchable words', async () => {
      await service.hybridSearch('?!', { audiences: ['all'], aiContext: CTX });
      expect(sqlOf()).not.toContain('ts_stat');
    });

    it('applies documentType and category filters as parameters', async () => {
      await service.hybridSearch('features', { audiences: ['all'], documentType: 'guide', category: 'billing' });

      const [sql, ...params] = mockPrisma.$queryRawUnsafe.mock.calls[0];
      expect(sql).toContain('document_type = $');
      expect(sql).toContain('category = $');
      expect(params).toEqual(expect.arrayContaining(['guide', 'billing']));
    });

    it('caps chunks per source file', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        row({ document_id: 'a', vector_rank: 1, text_rank: 1 }),
        row({ document_id: 'b', vector_rank: 2, text_rank: 2 }),
        row({ document_id: 'c', vector_rank: 3, text_rank: 3 }),
      ]);

      const results = await service.hybridSearch('invite', { audiences: ['all'] });
      expect(results.map((r) => r.documentId)).toEqual(['a', 'b']);
    });

    it("groups a product's own rows (no source path) by their document for the cap", async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        row({ document_id: 'p1', source_path: null, parent_doc_id: 'doc_parent', vector_rank: 1, text_rank: 1 }),
        row({ document_id: 'p2', source_path: null, parent_doc_id: 'doc_parent', vector_rank: 2, text_rank: 2 }),
        row({ document_id: 'p3', source_path: null, parent_doc_id: 'doc_parent', vector_rank: 3, text_rank: 3 }),
        row({ document_id: 'solo', source_path: null, parent_doc_id: null, vector_rank: 4, text_rank: 4 }),
      ]);

      const results = await service.hybridSearch('invite', { audiences: ['all'] });
      expect(results.map((r) => r.documentId)).toEqual(['p1', 'p2', 'solo']);
    });

    it('embeds an operator query on the platform route as a query when asked, with no tenant', async () => {
      await service.hybridSearch('invite', { audiences: ['all'], platformQuery: true });

      expect(mockEmbedding.embedForPlatform).toHaveBeenCalledWith(['invite'], 'query');
      expect(mockEmbedding.embedText).not.toHaveBeenCalled();
      expect(isVectorQuery(sqlOf())).toBe(true);
    });
  });

  describe('full-text when there is no query vector', () => {
    it.each([
      ['AiNotConfigured', new AiNotConfigured('embedding')],
      ['ZeroRetentionUnavailable', new ZeroRetentionUnavailable('embedding')],
      ['AiCredentialFailing', new AiCredentialFailing('embedding')],
      ['a provider error', new Error('provider down')],
    ])('answers from full-text alone when the resolver or provider refuses: %s', async (_label, error) => {
      mockEmbedding.embedText.mockRejectedValue(error);
      mockPrisma.$queryRawUnsafe.mockResolvedValue([row({ vector_rank: null, vector_similarity: null })]);

      const results = await service.hybridSearch('audit log', { audiences: ['all'], aiContext: CTX });

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
      expect(isVectorQuery(sqlOf())).toBe(false);
      expect(sqlOf()).toContain('to_tsvector');
      expect(results).toHaveLength(1);
    });

    it('tells the caller when the query was not embedded, so a measurement can say it ran on full-text', async () => {
      mockEmbedding.embedForPlatform.mockRejectedValue(new Error('invalid api key'));
      const onQueryNotEmbedded = jest.fn();

      await service.hybridSearch('audit log', { audiences: ['all'], platformQuery: true, onQueryNotEmbedded });

      expect(onQueryNotEmbedded).toHaveBeenCalledTimes(1);
      expect(onQueryNotEmbedded.mock.calls[0][0]).toContain('invalid api key');
      expect(isVectorQuery(sqlOf())).toBe(false);
    });

    it('does not report a fallback when the query was embedded', async () => {
      const onQueryNotEmbedded = jest.fn();

      await service.hybridSearch('audit log', { audiences: ['all'], platformQuery: true, onQueryNotEmbedded });

      expect(onQueryNotEmbedded).not.toHaveBeenCalled();
    });

    it('never embeds without a tenant to route by', async () => {
      await service.hybridSearch('audit log', { audiences: ['all'] });

      expect(mockEmbedding.embedText).not.toHaveBeenCalled();
      expect(mockEmbedding.embedForPlatform).not.toHaveBeenCalled();
      expect(isVectorQuery(sqlOf())).toBe(false);
    });
  });

  describe('audience filter is an exact set', () => {
    it("binds the caller's audiences as one array and never widens it with 'all'", async () => {
      await service.hybridSearch('pricing', { audiences: ['admin'] });

      const [sql, ...params] = mockPrisma.$queryRawUnsafe.mock.calls[0];
      expect(sql).toMatch(/audience = ANY\(\$\d+::text\[\]\)/);
      expect(sql).not.toContain("audience = 'all'");
      expect(params).toContainEqual(['admin']);
    });

    it('refuses an empty audience set rather than searching everything', async () => {
      await expect(service.hybridSearch('pricing', { audiences: [] })).rejects.toThrow(/audience/);
      expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
      await expect(service.getByCategory('billing', [])).rejects.toThrow(/audience/);
    });
  });

  describe('getByCategory', () => {
    it('fetches a topic in reading order for exactly the given audiences', async () => {
      await service.getByCategory('getting-started', ['all']);

      expect(mockPrisma.knowledgeDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { category: 'getting-started', audience: { in: ['all'] } },
          orderBy: [{ sourcePath: 'asc' }, { chunkIndex: 'asc' }],
          take: 40,
        }),
      );
    });
  });
});

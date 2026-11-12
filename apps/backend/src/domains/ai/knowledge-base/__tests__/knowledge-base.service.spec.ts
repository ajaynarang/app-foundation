import { KnowledgeBaseService } from '../knowledge-base.service';
import { AiNotConfigured } from '../../routing/ai-not-configured.error';
import { ZeroRetentionUnavailable } from '../../infrastructure/redaction/zero-retention-unavailable.error';

const CTX = { tenantId: 7, surface: 'EMBEDDING' as const };

describe('KnowledgeBaseService', () => {
  let service: KnowledgeBaseService;
  let mockPrisma: any;
  let mockEmbedding: any;

  beforeEach(() => {
    mockPrisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        {
          document_id: 'doc_001',
          title: 'Audit Log',
          content: 'The platform optimizes your workflows...',
          document_type: 'feature',
          audience: 'user',
          category: 'getting-started',
          keywords: ['route', 'planning'],
          similarity: '0.89',
        },
      ]),
      knowledgeDocument: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    mockEmbedding = {
      embedText: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
    };

    service = new KnowledgeBaseService(mockPrisma, mockEmbedding);
  });

  describe('hybridSearch', () => {
    it('should return documents matching the query', async () => {
      const results = await service.hybridSearch('How does the audit log work?', {
        audience: 'user',
        limit: 5,
        aiContext: CTX,
      });

      expect(mockEmbedding.embedText).toHaveBeenCalledWith('How does the audit log work?', CTX, 'query');
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalled();
      expect(results).toHaveLength(1);
      expect(results[0].documentId).toBe('doc_001');
      expect(results[0].similarity).toBe(0.89);
    });

    it('should filter by audience when provided', async () => {
      await service.hybridSearch('pricing', { audience: 'user', limit: 5 });

      const rawQuery = mockPrisma.$queryRawUnsafe.mock.calls[0][0];
      expect(rawQuery).toContain('audience');
    });

    it('should filter by documentType when provided', async () => {
      await service.hybridSearch('features', {
        audience: 'all',
        documentType: 'feature',
        limit: 5,
      });

      const rawQuery = mockPrisma.$queryRawUnsafe.mock.calls[0][0];
      expect(rawQuery).toContain('document_type');
    });

    it('should filter by category when provided', async () => {
      await service.hybridSearch('pricing details', {
        audience: 'user',
        category: 'pricing',
        limit: 3,
      });

      const rawQuery = mockPrisma.$queryRawUnsafe.mock.calls[0][0];
      expect(rawQuery).toContain('category');
    });
  });

  describe('hybridSearch — full-text when there is no query vector', () => {
    const isVectorQuery = (sql: string) => sql.includes('<=>');

    it.each([
      ['AiNotConfigured', new AiNotConfigured('embedding')],
      ['ZeroRetentionUnavailable', new ZeroRetentionUnavailable('embedding')],
      ['a provider error', new Error('provider down')],
    ])('answers from full-text when embedding the query fails with %s', async (_label, error) => {
      mockEmbedding.embedText.mockRejectedValue(error);

      const results = await service.hybridSearch('audit log', { audience: 'user', aiContext: CTX });

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
      const [sql, ...params] = mockPrisma.$queryRawUnsafe.mock.calls[0];
      expect(isVectorQuery(sql)).toBe(false);
      expect(sql).toContain('plainto_tsquery');
      expect(params).toContain('audit log');
      expect(results).toHaveLength(1);
    });

    it('never embeds without a tenant to route by, and searches full-text', async () => {
      await service.hybridSearch('audit log', { audience: 'user' });

      expect(mockEmbedding.embedText).not.toHaveBeenCalled();
      expect(isVectorQuery(mockPrisma.$queryRawUnsafe.mock.calls[0][0])).toBe(false);
    });

    it('falls back to full-text when no stored chunk has a vector yet (vectors cleared, not re-embedded)', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]);

      const results = await service.hybridSearch('audit log', { audience: 'user', aiContext: CTX });

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
      expect(isVectorQuery(mockPrisma.$queryRawUnsafe.mock.calls[0][0])).toBe(true);
      expect(isVectorQuery(mockPrisma.$queryRawUnsafe.mock.calls[1][0])).toBe(false);
      expect(results).toHaveLength(1);
    });

    it('keeps the audience filter on the full-text query', async () => {
      await service.hybridSearch('audit log', { audience: 'user', category: 'billing' });

      const [sql, ...params] = mockPrisma.$queryRawUnsafe.mock.calls[0];
      expect(sql).toContain('audience');
      expect(sql).toContain('category');
      expect(params).toEqual(expect.arrayContaining(['user', 'billing']));
    });
  });

  describe('getByCategory', () => {
    it('should fetch documents by category and audience', async () => {
      await service.getByCategory('getting-started', 'user');

      expect(mockPrisma.knowledgeDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: 'getting-started',
            audience: expect.objectContaining({ in: ['user', 'all'] }),
          }),
        }),
      );
    });
  });
});

import { KnowledgeBaseService } from '../knowledge-base.service';
import { EmbeddingService } from '../../infrastructure/providers/embedding.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

describe('KnowledgeBaseService', () => {
  let service: KnowledgeBaseService;
  let mockPrisma: any;
  let mockEmbedding: any;

  beforeEach(() => {
    mockPrisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        {
          document_id: 'doc_001',
          title: 'Route Planning',
          content: 'The platform optimizes your workflows...',
          document_type: 'feature',
          audience: 'prospect',
          category: 'route_planning',
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

    service = new KnowledgeBaseService(
      mockPrisma as unknown as PrismaService,
      mockEmbedding as unknown as EmbeddingService,
    );
  });

  describe('hybridSearch', () => {
    it('should return documents matching the query', async () => {
      const results = await service.hybridSearch('How does route planning work?', {
        audience: 'prospect',
        limit: 5,
      });

      expect(mockEmbedding.embedText).toHaveBeenCalledWith('How does route planning work?');
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalled();
      expect(results).toHaveLength(1);
      expect(results[0].documentId).toBe('doc_001');
      expect(results[0].similarity).toBe(0.89);
    });

    it('should filter by audience when provided', async () => {
      await service.hybridSearch('pricing', { audience: 'prospect', limit: 5 });

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
        audience: 'prospect',
        category: 'pricing',
        limit: 3,
      });

      const rawQuery = mockPrisma.$queryRawUnsafe.mock.calls[0][0];
      expect(rawQuery).toContain('category');
    });
  });

  describe('getByCategory', () => {
    it('should fetch documents by category and audience', async () => {
      await service.getByCategory('route_planning', 'prospect');

      expect(mockPrisma.knowledgeDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: 'route_planning',
            audience: expect.objectContaining({ in: ['prospect', 'all'] }),
          }),
        }),
      );
    });
  });
});

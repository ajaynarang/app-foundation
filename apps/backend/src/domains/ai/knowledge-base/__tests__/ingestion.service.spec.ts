import { IngestionService } from '../ingestion.service';
import { EmbeddingService } from '../../infrastructure/providers/embedding.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { loadAllEntries } from '../content/content-loader';

jest.mock('../../../../shared/utils/id-generator', () => ({
  generateId: jest.fn().mockReturnValue('doc_mock_id'),
}));

jest.mock('../content/content-loader', () => ({
  loadAllEntries: jest.fn().mockReturnValue([
    {
      title: 'What is SALLY?',
      content: 'SALLY is a fleet operations assistant that helps trucking companies.',
      documentType: 'faq',
      audience: 'prospect',
      category: 'general',
      keywords: ['sally', 'overview'],
    },
    {
      title: 'Route Planning Engine',
      content: 'The route planning engine optimizes stop sequences using TSP/VRP.',
      documentType: 'feature',
      audience: 'all',
      category: 'route_planning',
      keywords: ['route', 'optimization'],
    },
  ]),
}));

describe('IngestionService', () => {
  let service: IngestionService;
  let mockPrisma: any;
  let mockEmbedding: any;

  beforeEach(() => {
    mockPrisma = {
      knowledgeDocument: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn().mockImplementation(async (fn) => {
        return fn(mockPrisma);
      }),
    };

    mockEmbedding = {
      embedText: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      embedBatch: jest.fn().mockImplementation((texts: string[]) => Promise.resolve(texts.map(() => [0.1, 0.2, 0.3]))),
    };

    service = new IngestionService(
      mockPrisma as unknown as PrismaService,
      mockEmbedding as unknown as EmbeddingService,
    );
  });

  describe('chunkText', () => {
    it('should not chunk text shorter than max chunk size', () => {
      const chunks = service.chunkText('Short text.', 500, 50);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe('Short text.');
    });

    it('should chunk long text with overlap', () => {
      const longText = Array(100).fill('word').join(' ');
      const chunks = service.chunkText(longText, 200, 50);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('should respect sentence boundaries when possible', () => {
      const text =
        'First sentence here. Second sentence here. Third sentence here. Fourth sentence here. Fifth sentence in this text.';
      const chunks = service.chunkText(text, 50, 10);
      for (const chunk of chunks) {
        expect(chunk.trim()).toBeTruthy();
      }
    });

    it('should return empty array for empty text', () => {
      expect(service.chunkText('')).toEqual([]);
      expect(service.chunkText('  ')).toEqual([]);
    });
  });

  describe('ingestAll', () => {
    it('should call loadKnowledgeEntries and ingest entries', async () => {
      const result = await service.ingestAll();

      expect(loadAllEntries).toHaveBeenCalled();
      expect(mockPrisma.knowledgeDocument.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.knowledgeDocument.create).toHaveBeenCalled();
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalled();
      expect(result.documentCount).toBe(2);
      expect(result.chunkCount).toBe(2);
    });

    it('should batch-embed all chunks with title prefix', async () => {
      await service.ingestAll();

      expect(mockEmbedding.embedBatch).toHaveBeenCalled();
      const batchTexts = mockEmbedding.embedBatch.mock.calls[0][0];
      expect(batchTexts.length).toBe(2);
      expect(batchTexts[0]).toContain('What is SALLY?:');
    });
  });
});

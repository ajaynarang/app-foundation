import { IngestionService } from '../ingestion.service';
import { loadAllEntries } from '../content/content-loader';
import { AiNotConfigured } from '../../routing/ai-not-configured.error';

jest.mock('@appshore/kernel/shared/utils/id-generator', () => ({
  generateId: jest.fn().mockReturnValue('doc_mock_id'),
}));

jest.mock('../content/content-loader', () => ({
  loadAllEntries: jest.fn().mockReturnValue([
    {
      title: 'What is the platform?',
      content: 'The platform is an assistant that helps you get things done.',
      documentType: 'faq',
      audience: 'user',
      category: 'general',
      keywords: ['platform', 'overview'],
    },
    {
      title: 'Audit Log',
      content: 'The audit log records every change with its actor and timestamp.',
      documentType: 'feature',
      audience: 'all',
      category: 'getting-started',
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
      embedForPlatform: jest
        .fn()
        .mockImplementation((texts: string[]) => Promise.resolve(texts.map(() => [0.1, 0.2, 0.3]))),
    };

    service = new IngestionService(mockPrisma, mockEmbedding);
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
      expect(result.embedded).toBe(true);
    });

    it('embeds all chunks in one batch on the platform route (global content, no tenant), with title prefix', async () => {
      await service.ingestAll();

      expect(mockEmbedding.embedForPlatform).toHaveBeenCalledTimes(1);
      const batchTexts = mockEmbedding.embedForPlatform.mock.calls[0][0];
      expect(batchTexts.length).toBe(2);
      expect(batchTexts[0]).toContain('What is the platform?:');
    });

    it('stores the chunks without vectors when no platform embedding route is configured, and says so', async () => {
      mockEmbedding.embedForPlatform.mockRejectedValue(new AiNotConfigured('embedding'));

      const result = await service.ingestAll();

      expect(mockPrisma.knowledgeDocument.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
      expect(result).toMatchObject({ documentCount: 2, chunkCount: 2, embedded: false });
    });

    it('leaves the stored rows untouched when the provider fails (embeds before it deletes)', async () => {
      mockEmbedding.embedForPlatform.mockRejectedValue(new Error('provider down'));

      await expect(service.ingestAll()).rejects.toThrow('provider down');
      expect(mockPrisma.knowledgeDocument.deleteMany).not.toHaveBeenCalled();
    });
  });
});

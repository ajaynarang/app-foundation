import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';

// Must mock langfuse before importing FeedbackService (langfuse has ESM issues)
jest.mock('langfuse', () => ({
  Langfuse: jest.fn().mockImplementation(() => ({ getPrompt: jest.fn() })),
}));
jest.mock('langfuse-core', () => ({}));
jest.mock('../../ai/infrastructure/providers/ai-provider', () => ({
  ai: jest.fn(() => 'mock-model'),
}));
jest.mock('ai', () => ({
  generateText: jest.fn().mockResolvedValue({ text: 'bug' }),
}));

// Import after mocks
import { FeedbackService } from '../feedback.service';
import { PromptingService } from '../../prompting';

const mockPrisma = {
  feedback: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
};

const mockPromptService = {
  registerFallback: jest.fn(),
  getPrompt: jest.fn().mockResolvedValue('You are a feedback categorizer.'),
};

describe('FeedbackService', () => {
  let service: FeedbackService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PromptingService, useValue: mockPromptService },
      ],
    }).compile();
    service = module.get<FeedbackService>(FeedbackService);
  });

  describe('create', () => {
    it('should create feedback with correct data', async () => {
      const dto = {
        sentiment: 4,
        message: 'Great product!',
        page: '/dashboard',
      };
      mockPrisma.feedback.create.mockResolvedValue({ id: 1, ...dto });

      const result = await service.create(1, 10, dto);

      expect(result.id).toBe(1);
      expect(mockPrisma.feedback.create).toHaveBeenCalledWith({
        data: {
          userId: 1,
          tenantId: 10,
          sentiment: 4,
          message: 'Great product!',
          page: '/dashboard',
        },
      });
    });
  });

  describe('listOwn', () => {
    it('should return feedback for user within tenant', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([{ id: 1 }]);
      const result = await service.listOwn(1, 10);
      expect(result).toHaveLength(1);
      expect(mockPrisma.feedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 1, tenantId: 10 } }),
      );
    });
  });

  describe('listAll', () => {
    it('should filter by status and category', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([]);
      mockPrisma.feedback.count.mockResolvedValue(0);

      const result = await service.listAll({
        status: 'NEW',
        category: 'bug',
      } as any);

      expect(result.total).toBe(0);
    });

    it('should handle uncategorized filter', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([]);
      mockPrisma.feedback.count.mockResolvedValue(0);

      await service.listAll({ category: 'uncategorized' });

      expect(mockPrisma.feedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: null }),
        }),
      );
    });

    it('should support pagination', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([]);
      mockPrisma.feedback.count.mockResolvedValue(50);

      const result = await service.listAll({ page: 2, limit: 10 });

      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
    });
  });

  describe('getDetail', () => {
    it('should throw NotFoundException for missing feedback', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(null);
      await expect(service.getDetail(999)).rejects.toThrow(NotFoundException);
    });

    it('should return feedback with relations', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue({
        id: 1,
        message: 'Bug report',
        user: { firstName: 'John' },
        tenant: { companyName: 'Acme' },
        resolver: null,
      });

      const result = await service.getDetail(1);
      expect(result.id).toBe(1);
    });
  });

  describe('resolve', () => {
    it('should throw NotFoundException if feedback not found', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(null);
      await expect(service.resolve(999, 1, { note: 'Fixed' } as any)).rejects.toThrow(NotFoundException);
    });

    it('should resolve feedback with note and admin user', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.feedback.update.mockResolvedValue({
        id: 1,
        status: 'RESOLVED',
      });

      await service.resolve(1, 42, {
        note: 'Fixed in v2',
      });

      expect(mockPrisma.feedback.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          status: 'RESOLVED',
          resolvedBy: 42,
          note: 'Fixed in v2',
        }),
      });
    });
  });

  describe('updateStatus', () => {
    it('should update feedback status', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.feedback.update.mockResolvedValue({
        id: 1,
        status: 'REVIEWED',
      });

      await service.updateStatus(1, { status: 'REVIEWED' } as any);

      expect(mockPrisma.feedback.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'REVIEWED' },
      });
    });
  });

  describe('updateCategory', () => {
    it('should update feedback category', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.feedback.update.mockResolvedValue({ id: 1, category: 'idea' });

      await service.updateCategory(1, { category: 'idea' } as any);

      expect(mockPrisma.feedback.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { category: 'idea' },
      });
    });
  });

  describe('getStats', () => {
    it('should return aggregated stats', async () => {
      mockPrisma.feedback.count.mockResolvedValue(100);
      mockPrisma.feedback.groupBy
        .mockResolvedValueOnce([
          { status: 'NEW', _count: { id: 60 } },
          { status: 'RESOLVED', _count: { id: 40 } },
        ])
        .mockResolvedValueOnce([
          { sentiment: 5, _count: { id: 50 } },
          { sentiment: 3, _count: { id: 50 } },
        ]);

      const result = await service.getStats();

      expect(result.total).toBe(100);
      expect((result as any).NEW).toBe(60);
      expect((result as any).RESOLVED).toBe(40);
      expect(result.bySentiment).toHaveLength(2);
    });
  });

  describe('categorizeWithAi', () => {
    it('should throw NotFoundException when feedback not found', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(null);
      await expect(service.categorizeWithAi(999)).rejects.toThrow(NotFoundException);
    });

    it('should categorize feedback using AI and update', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue({
        id: 1,
        message: 'The app keeps crashing when I click save',
      });
      mockPrisma.feedback.update.mockResolvedValue({
        id: 1,
        category: 'bug',
      });

      const result = await service.categorizeWithAi(1);

      expect(result.category).toBe('bug');
    });
  });

  describe('bulkCategorize', () => {
    it('should return 0 when no uncategorized feedback', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([]);

      const result = await service.bulkCategorize();

      expect(result).toEqual({ categorized: 0 });
    });

    it('should categorize each uncategorized feedback', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([
        { id: 1, message: 'App crashes on load' },
        { id: 2, message: 'Would be nice to have dark mode' },
      ]);
      mockPrisma.feedback.update.mockResolvedValue({});

      const result = await service.bulkCategorize();

      expect(result.total).toBe(2);
      expect(result.categorized).toBe(2);
      expect(mockPrisma.feedback.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('getTenants', () => {
    it('should return distinct tenants from feedback', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([
        { tenant: { id: 1, companyName: 'Acme' } },
        { tenant: { id: 2, companyName: 'Acme Co' } },
      ]);

      const result = await service.getTenants();

      expect(result).toEqual([
        { id: 1, companyName: 'Acme' },
        { id: 2, companyName: 'Acme Co' },
      ]);
    });
  });

  describe('listAll — advanced filters', () => {
    it('should filter by tenantId', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([]);
      mockPrisma.feedback.count.mockResolvedValue(0);

      await service.listAll({ tenantId: 5 });

      expect(mockPrisma.feedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 5 }),
        }),
      );
    });

    it('should filter by sentiment range', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([]);
      mockPrisma.feedback.count.mockResolvedValue(0);

      await service.listAll({ sentimentMin: 3, sentimentMax: 5 });

      expect(mockPrisma.feedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sentiment: { gte: 3, lte: 5 },
          }),
        }),
      );
    });

    it('should filter by date range', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([]);
      mockPrisma.feedback.count.mockResolvedValue(0);

      await service.listAll({
        from: '2026-01-01',
        to: '2026-01-31',
      });

      expect(mockPrisma.feedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });
  });

  describe('updateStatus — not found', () => {
    it('should throw when feedback not found', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(null);

      await expect(service.updateStatus(999, { status: 'REVIEWED' } as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateCategory — not found', () => {
    it('should throw when feedback not found', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(null);

      await expect(service.updateCategory(999, { category: 'bug' } as any)).rejects.toThrow(NotFoundException);
    });
  });
});

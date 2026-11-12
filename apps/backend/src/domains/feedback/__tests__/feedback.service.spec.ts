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
import { fixtureModel, tiedTimestamps, walkCursorList } from '@appshore/platform/test/helpers/cursor-walk';
import { groupCountInMemory } from '@appshore/platform/test/helpers/prisma-where';

const FEEDBACK_ID = '0190f1c2-0000-7000-8000-000000000001';
const MISSING_ID = '0190f1c2-0000-7000-8000-00000000dead';
/** A stored row: the Int key the API must never show, and the public id it shows instead. */
const storedRow = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  publicId: FEEDBACK_ID,
  userId: 1,
  tenantId: 10,
  category: null,
  sentiment: 4,
  message: 'Great product!',
  page: '/dashboard',
  status: 'NEW',
  note: null,
  resolvedBy: null,
  resolvedAt: null,
  createdAt: new Date('2026-03-01T12:00:00.000Z'),
  updatedAt: new Date('2026-03-01T12:00:00.000Z'),
  ...overrides,
});

const mockPrisma = {
  tenant: { findMany: jest.fn(), count: jest.fn() },
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
      mockPrisma.feedback.create.mockResolvedValue(storedRow(dto));

      const result = await service.create(1, 10, dto);

      // Named by its public id; the Int key and the foreign keys stay inside.
      expect(result.feedbackId).toBe(FEEDBACK_ID);
      expect(result).not.toHaveProperty('id');
      expect(result).not.toHaveProperty('userId');
      expect(result).not.toHaveProperty('tenantId');
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

  describe('listOwn: a cursor list, newest first', () => {
    it('should return feedback for user within tenant', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([storedRow()]);
      mockPrisma.feedback.count.mockResolvedValue(1);
      const result = await service.listOwn(1, 10);
      expect(result.items).toHaveLength(1);
      expect(result).toMatchObject({ nextCursor: null, total: 1 });
      expect(result.items[0]).not.toHaveProperty('id');
      expect(mockPrisma.feedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 1, tenantId: 10 },
          orderBy: [{ createdAt: 'desc' }, { publicId: 'desc' }],
          take: 51,
        }),
      );
    });
  });

  describe('listAll', () => {
    it('should filter by status and category', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([]);
      mockPrisma.feedback.groupBy.mockResolvedValue([]);

      const result = await service.listAll({
        status: 'NEW',
        category: 'bug',
      } as any);

      expect(result.total).toBe(0);
      expect(mockPrisma.feedback.findMany.mock.calls[0][0].where).toEqual({
        AND: [{ category: 'bug' }, { status: 'NEW' }],
      });
    });

    it('should handle uncategorized filter', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([]);
      mockPrisma.feedback.groupBy.mockResolvedValue([]);

      await service.listAll({ category: 'uncategorized' });

      expect(mockPrisma.feedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: null }),
        }),
      );
    });

    describe('walking pages over a fixture', () => {
      // Feedback sent in a burst shares a timestamp. Seven rows are tenant 10's, one is tenant 20's.
      const stamps = tiedTimestamps(8);
      const rows = stamps.map((createdAt, index) =>
        storedRow({
          id: index + 1,
          publicId: `0190f1c2-0000-7000-8000-00000000000${(index * 5) % 8}`,
          tenantId: index === 7 ? 20 : 10,
          status: index < 2 ? 'RESOLVED' : 'NEW',
          createdAt,
          user: { userId: 'usr_1', firstName: 'A', lastName: 'B', email: 'a@example.com', role: 'MEMBER' },
          tenant: { tenantId: 'acme', companyName: 'Acme' },
          resolver: null,
        }),
      );

      beforeEach(() => {
        Object.assign(mockPrisma.feedback, fixtureModel(rows));
        mockPrisma.feedback.groupBy.mockImplementation(async (args: any) => groupCountInMemory(rows, args));
      });

      it('returns every row once across pages, ties included, with no Int key on any of them', async () => {
        const totals: number[] = [];
        const { pages, items } = await walkCursorList(async (cursor) => {
          const page = await service.listAll({ limit: 3, cursor });
          totals.push(page.total);
          return page;
        });

        expect(pages.map((page) => page.length)).toEqual([3, 3, 2]);
        expect(new Set(items.map((item) => item.feedbackId)).size).toBe(8);
        const times = items.map((item) => item.createdAt.getTime());
        expect(times).toEqual([...times].sort((a, b) => b - a));
        expect(totals).toEqual([8, 8, 8]);
        for (const item of items) {
          expect(item).not.toHaveProperty('id');
          expect(item.tenant).toEqual({ tenantId: 'acme', companyName: 'Acme' });
        }
      });

      it('counts every status for the filters, ignoring the status filter, and totals the status in view', async () => {
        const page = await service.listAll({ tenantId: 10, status: 'RESOLVED' });
        expect(page.counts).toEqual({ NEW: 5, REVIEWED: 0, RESOLVED: 2 });
        expect(page.total).toBe(2);
        expect(page.items).toHaveLength(2);
      });

      it('answers 400 on a cursor it did not issue, before any query runs', async () => {
        await expect(service.listAll({ cursor: 'nope' })).rejects.toMatchObject({ status: 400 });
        await expect(service.listOwn(1, 10, { cursor: 'nope' })).rejects.toMatchObject({ status: 400 });
        expect(mockPrisma.feedback.findMany).not.toHaveBeenCalled();
      });
    });
  });

  describe('getDetail', () => {
    it('should throw NotFoundException for missing feedback', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(null);
      await expect(service.getDetail(MISSING_ID)).rejects.toThrow(NotFoundException);
    });

    it('should return feedback with relations', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(
        storedRow({
          message: 'Bug report',
          user: { userId: 'usr_1', firstName: 'John', lastName: 'D', email: 'j@example.com', role: 'MEMBER' },
          tenant: { tenantId: 'acme', companyName: 'Acme' },
          resolver: null,
        }),
      );

      const result = await service.getDetail(FEEDBACK_ID);
      expect(result.feedbackId).toBe(FEEDBACK_ID);
      expect(result.tenant).toEqual({ tenantId: 'acme', companyName: 'Acme' });
      expect(result).not.toHaveProperty('id');
      // Resolved by its public id, never the Int key.
      expect(mockPrisma.feedback.findUnique.mock.calls[0][0].where).toEqual({ publicId: FEEDBACK_ID });
    });
  });

  describe('resolve', () => {
    it('should throw NotFoundException if feedback not found', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(null);
      await expect(service.resolve(MISSING_ID, 1, { note: 'Fixed' } as any)).rejects.toThrow(NotFoundException);
    });

    it('should resolve feedback with note and admin user', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(storedRow());
      mockPrisma.feedback.update.mockResolvedValue(storedRow({ status: 'RESOLVED' }));

      await service.resolve(FEEDBACK_ID, 42, {
        note: 'Fixed in v2',
      });

      expect(mockPrisma.feedback.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            status: 'RESOLVED',
            resolvedBy: 42,
            note: 'Fixed in v2',
          }),
        }),
      );
    });
  });

  describe('updateStatus', () => {
    it('should update feedback status', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(storedRow());
      mockPrisma.feedback.update.mockResolvedValue(storedRow({ status: 'REVIEWED' }));

      await service.updateStatus(FEEDBACK_ID, { status: 'REVIEWED' } as any);

      expect(mockPrisma.feedback.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 }, data: { status: 'REVIEWED' } }),
      );
    });
  });

  describe('updateCategory', () => {
    it('should update feedback category', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(storedRow());
      mockPrisma.feedback.update.mockResolvedValue(storedRow({ category: 'idea' }));

      await service.updateCategory(FEEDBACK_ID, { category: 'idea' } as any);

      expect(mockPrisma.feedback.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 }, data: { category: 'idea' } }),
      );
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
      await expect(service.categorizeWithAi(MISSING_ID)).rejects.toThrow(NotFoundException);
    });

    it('should categorize feedback using AI and update', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(
        storedRow({ message: 'The app keeps crashing when I click save' }),
      );
      mockPrisma.feedback.update.mockResolvedValue(storedRow({ category: 'bug' }));

      const result = await service.categorizeWithAi(FEEDBACK_ID);

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

  describe('getTenants: the tenant filter picker', () => {
    it('lists only tenants that have feedback, as a cursor list searched on the server', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: 1, tenantId: 'acme', companyName: 'Acme' },
        { id: 2, tenantId: 'acme-co', companyName: 'Acme Co' },
      ]);
      mockPrisma.tenant.count.mockResolvedValue(2);

      const result = await service.getTenants({ q: 'acme' });

      expect(result).toEqual({
        items: [
          { id: 1, tenantId: 'acme', companyName: 'Acme' },
          { id: 2, tenantId: 'acme-co', companyName: 'Acme Co' },
        ],
        nextCursor: null,
        total: 2,
      });
      const args = mockPrisma.tenant.findMany.mock.calls[0][0];
      expect(args.where.AND[0]).toEqual({ feedback: { some: {} } });
      expect(args.take).toBe(51);
      // No feedback row is read to find its tenant.
      expect(mockPrisma.feedback.findMany).not.toHaveBeenCalled();
    });
  });

  describe('listAll — advanced filters', () => {
    it('should filter by tenantId', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([]);
      mockPrisma.feedback.groupBy.mockResolvedValue([]);

      await service.listAll({ tenantId: 5 });

      expect(mockPrisma.feedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 5 }),
        }),
      );
    });

    it('should filter by sentiment range', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([]);
      mockPrisma.feedback.groupBy.mockResolvedValue([]);

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
      mockPrisma.feedback.groupBy.mockResolvedValue([]);

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

      await expect(service.updateStatus(MISSING_ID, { status: 'REVIEWED' } as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateCategory — not found', () => {
    it('should throw when feedback not found', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(null);

      await expect(service.updateCategory(MISSING_ID, { category: 'bug' } as any)).rejects.toThrow(NotFoundException);
    });
  });
});

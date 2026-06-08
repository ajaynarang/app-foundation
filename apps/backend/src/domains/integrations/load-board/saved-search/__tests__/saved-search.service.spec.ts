import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { SavedSearchService } from '../saved-search.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('SavedSearchService', () => {
  let service: SavedSearchService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      loadBoardSavedSearch: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SavedSearchService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<SavedSearchService>(SavedSearchService);
  });

  describe('create', () => {
    it('should create a saved search and return response', async () => {
      const created = {
        id: 1,
        savedSearchId: 'ss-1',
        name: 'Dallas loads',
        searchParams: { origin: { city: 'Dallas', state: 'TX' } },
        isActive: true,
        minRate: 2.5,
        lastPolledAt: null,
        lastMatchCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.loadBoardSavedSearch.create.mockResolvedValue(created);

      const result = await service.create(1, 10, {
        name: 'Dallas loads',
        searchParams: { origin: { city: 'Dallas', state: 'TX' } },
        minRate: 2.5,
      } as any);

      expect(result.savedSearchId).toBe('ss-1');
      expect(result.name).toBe('Dallas loads');
    });
  });

  describe('findAllForUser', () => {
    it('should return mapped search list', async () => {
      prisma.loadBoardSavedSearch.findMany.mockResolvedValue([
        {
          savedSearchId: 'ss-1',
          name: 'Test',
          searchParams: {},
          isActive: true,
          minRate: null,
          lastPolledAt: null,
          lastMatchCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.findAllForUser(1, 10);

      expect(result).toHaveLength(1);
      expect(result[0].savedSearchId).toBe('ss-1');
    });
  });

  describe('toggleActive', () => {
    it('should toggle isActive flag', async () => {
      prisma.loadBoardSavedSearch.findUnique.mockResolvedValue({
        id: 1,
        savedSearchId: 'ss-1',
        tenantId: 1,
        userId: 10,
        isActive: false,
        name: 'Test',
      });
      prisma.loadBoardSavedSearch.update.mockResolvedValue({
        savedSearchId: 'ss-1',
        name: 'Test',
        isActive: true,
        searchParams: {},
        minRate: null,
        lastPolledAt: null,
        lastMatchCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.toggleActive(1, 10, 'ss-1');

      expect(result.isActive).toBe(true);
    });

    it('should throw NotFoundException for wrong tenant', async () => {
      prisma.loadBoardSavedSearch.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 99,
        userId: 10,
      });

      await expect(service.toggleActive(1, 10, 'ss-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for wrong user', async () => {
      prisma.loadBoardSavedSearch.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
        userId: 99,
      });

      await expect(service.toggleActive(1, 10, 'ss-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete', () => {
    it('should delete search after authorization', async () => {
      prisma.loadBoardSavedSearch.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
        userId: 10,
        name: 'Test',
      });
      prisma.loadBoardSavedSearch.delete.mockResolvedValue({});

      await service.delete(1, 10, 'ss-1');

      expect(prisma.loadBoardSavedSearch.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });
  });

  describe('findAllActive', () => {
    it('should return active searches with user info', async () => {
      prisma.loadBoardSavedSearch.findMany.mockResolvedValue([{ id: 1, isActive: true, user: { userId: 'u-1' } }]);

      const result = await service.findAllActive();

      expect(result).toHaveLength(1);
    });
  });

  describe('updatePolled', () => {
    it('should update poll metadata', async () => {
      prisma.loadBoardSavedSearch.update.mockResolvedValue({});

      await service.updatePolled(1, 5, ['id-1', 'id-2']);

      expect(prisma.loadBoardSavedSearch.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          lastMatchCount: 5,
          lastSeenIds: ['id-1', 'id-2'],
        }),
      });
    });
  });
});

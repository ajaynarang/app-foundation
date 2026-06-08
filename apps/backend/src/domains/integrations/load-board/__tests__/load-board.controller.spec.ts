// Mock mastra modules that cause ESM issues in Jest
jest.mock('../../../../domains/ai/sally-ai/mastra/mastra.provider', () => ({}));
jest.mock('../../../../domains/ai/infrastructure/providers/structured-output.service', () => ({
  StructuredOutputService: jest.fn(),
}));
jest.mock('../../adapters/adapter-factory.service', () => ({
  AdapterFactoryService: jest.fn(),
}));
jest.mock('../../oauth/auth-token.service', () => ({
  AuthTokenService: jest.fn(),
}));
jest.mock('../nlp/search-query-parser', () => ({
  SearchQueryParser: jest.fn(),
}));
jest.mock('../../../fleet/loads/services/loads.service', () => ({
  LoadsService: jest.fn(),
}));
jest.mock('../services/lane-rate.service', () => ({
  LaneRateService: jest.fn(),
}));
jest.mock('../load-board.service', () => ({
  LoadBoardService: jest.fn(),
}));
jest.mock('../recommendations/load-board-recommendations.service', () => ({
  LoadBoardRecommendationsService: jest.fn(),
}));
jest.mock('../saved-search/saved-search.service', () => ({
  SavedSearchService: jest.fn(),
}));
jest.mock('../services/search-history.service', () => ({
  SearchHistoryService: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LoadBoardController } from '../load-board.controller';
import { LoadBoardService } from '../load-board.service';
import { LoadBoardRecommendationsService } from '../recommendations/load-board-recommendations.service';
import { SavedSearchService } from '../saved-search/saved-search.service';
import { SearchHistoryService } from '../services/search-history.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const TENANT = { id: 5, tenantId: 'tenant-abc' };

const mockPrisma = {
  tenant: {
    findUnique: jest.fn().mockResolvedValue(TENANT),
    findFirst: jest.fn().mockResolvedValue(TENANT),
  },
  user: {
    findFirst: jest.fn().mockResolvedValue({ id: 10 }),
  },
};

const mockLoadBoardService = {
  search: jest.fn().mockResolvedValue({ listings: [], total: 0, page: 1 }),
  searchNlp: jest.fn().mockResolvedValue({ listings: [], total: 0, page: 1 }),
  getListingDetail: jest.fn().mockResolvedValue({ externalId: 'L1' }),
  importListing: jest.fn().mockResolvedValue({ loadNumber: 'LD-20260101-001' }),
};

const mockRecommendationsService = {
  getRecommendations: jest.fn().mockResolvedValue([]),
};

const mockSavedSearchService = {
  create: jest.fn().mockResolvedValue({ id: 'ss-1' }),
  findAllForUser: jest.fn().mockResolvedValue([]),
  toggleActive: jest.fn().mockResolvedValue({ isActive: true }),
  delete: jest.fn(),
};

const mockSearchHistoryService = {
  logSearch: jest.fn().mockResolvedValue(undefined),
  getHistory: jest.fn().mockResolvedValue([]),
  clearHistory: jest.fn(),
};

function makeReq(overrides?: Partial<{ user: any }>) {
  return {
    user: { tenantDbId: 5, userId: 'uid-1', dbId: 10, ...overrides?.user },
  };
}

describe('LoadBoardController', () => {
  let controller: LoadBoardController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LoadBoardController],
      providers: [
        { provide: LoadBoardService, useValue: mockLoadBoardService },
        {
          provide: LoadBoardRecommendationsService,
          useValue: mockRecommendationsService,
        },
        { provide: SavedSearchService, useValue: mockSavedSearchService },
        { provide: SearchHistoryService, useValue: mockSearchHistoryService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    controller = module.get<LoadBoardController>(LoadBoardController);
  });

  describe('search', () => {
    it('should call loadBoardService.search and log history', async () => {
      const dto = {
        origin: { city: 'Dallas', state: 'TX', radius: 50 },
        provider: 'dat',
        page: 1,
        limit: 25,
      };

      const result = await controller.search(makeReq(), dto as any);

      expect(result.total).toBe(0);
      expect(mockLoadBoardService.search).toHaveBeenCalledWith(5, dto);
    });
  });

  describe('searchNlp', () => {
    it('should delegate NLP search', async () => {
      const dto = { query: 'van loads out of Chicago' };

      await controller.searchNlp(makeReq(), dto as any);

      expect(mockLoadBoardService.searchNlp).toHaveBeenCalledWith(5, 'van loads out of Chicago');
    });
  });

  describe('getListingDetail', () => {
    it('should get listing detail', async () => {
      await controller.getListingDetail(makeReq(), 'ext-1', 'dat');

      expect(mockLoadBoardService.getListingDetail).toHaveBeenCalledWith(5, 'dat', 'ext-1');
    });
  });

  describe('getRecommendations', () => {
    it('should get recommendations', async () => {
      await controller.getRecommendations(makeReq());

      expect(mockRecommendationsService.getRecommendations).toHaveBeenCalledWith(5);
    });
  });

  describe('importLoad', () => {
    it('should import load from listing', async () => {
      const result = await controller.importLoad(makeReq(), {
        provider: 'dat',
        externalId: 'ext-1',
      } as any);

      expect(result.loadNumber).toBe('LD-20260101-001');
      expect(mockLoadBoardService.importListing).toHaveBeenCalledWith(5, 'dat', 'ext-1');
    });
  });

  describe('search history', () => {
    it('should get search history', async () => {
      await controller.getSearchHistory(makeReq());

      expect(mockSearchHistoryService.getHistory).toHaveBeenCalledWith(10, undefined);
    });

    it('should clear search history', async () => {
      await controller.clearSearchHistory(makeReq());

      expect(mockSearchHistoryService.clearHistory).toHaveBeenCalledWith(10);
    });
  });

  describe('saved searches', () => {
    it('should create saved search', async () => {
      await controller.createSavedSearch(makeReq(), {
        name: 'My Search',
      } as any);

      expect(mockSavedSearchService.create).toHaveBeenCalledWith(5, 10, expect.anything());
    });

    it('should list saved searches', async () => {
      await controller.listSavedSearches(makeReq());

      expect(mockSavedSearchService.findAllForUser).toHaveBeenCalledWith(5, 10);
    });

    it('should toggle saved search', async () => {
      await controller.toggleSavedSearch(makeReq(), 'ss-1');

      expect(mockSavedSearchService.toggleActive).toHaveBeenCalledWith(5, 10, 'ss-1');
    });

    it('should delete saved search', async () => {
      await controller.deleteSavedSearch(makeReq(), 'ss-1');

      expect(mockSavedSearchService.delete).toHaveBeenCalledWith(5, 10, 'ss-1');
    });
  });

  describe('getTenant fallback', () => {
    it('should look up tenant by userId when tenantDbId not present', async () => {
      const req = { user: { userId: 'uid-fallback' } };

      await controller.search(req, {
        origin: { city: 'X', state: 'TX', radius: 50 },
        provider: 'dat',
        page: 1,
        limit: 25,
      } as any);

      expect(mockPrisma.tenant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { users: { some: { userId: 'uid-fallback' } } },
        }),
      );
    });

    it('should throw NotFoundException if tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      mockPrisma.tenant.findFirst.mockResolvedValue(null);

      const req = { user: { userId: 'unknown' } };

      await expect(
        controller.search(req, {
          origin: { city: 'X', state: 'TX', radius: 50 },
          provider: 'dat',
          page: 1,
          limit: 25,
        } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUserDbId fallback', () => {
    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      const req = { user: { userId: 'no-user', tenantDbId: 5 } };

      await expect(controller.getSearchHistory(req)).rejects.toThrow(NotFoundException);
    });
  });
});

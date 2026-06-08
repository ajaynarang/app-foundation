import { Test, TestingModule } from '@nestjs/testing';
import { LoadBoardRecommendationsService } from '../load-board-recommendations.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../../infrastructure/cache/sally-cache.service';

// Mock LoadBoardService to avoid Mastra ESM import chain
jest.mock('../../load-board.service', () => ({
  LoadBoardService: jest.fn().mockImplementation(() => ({
    search: jest.fn(),
  })),
}));
import { LoadBoardService } from '../../load-board.service';

describe('LoadBoardRecommendationsService', () => {
  let service: LoadBoardRecommendationsService;
  let prisma: any;
  let cache: any;
  let loadBoardService: any;

  beforeEach(async () => {
    prisma = {
      vehicle: { findMany: jest.fn() },
      stop: { findFirst: jest.fn() },
    };

    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    loadBoardService = {
      search: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoadBoardRecommendationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SallyCacheService, useValue: cache },
        { provide: LoadBoardService, useValue: loadBoardService },
      ],
    }).compile();

    service = module.get<LoadBoardRecommendationsService>(LoadBoardRecommendationsService);
  });

  describe('getRecommendations', () => {
    it('should return cached results when available', async () => {
      const cached = [{ driver: { id: 'd-1' }, reason: 'Near Dallas', listings: [] }];
      cache.get.mockResolvedValue(cached);

      const result = await service.getRecommendations(1);

      expect(result).toEqual(cached);
      expect(prisma.vehicle.findMany).not.toHaveBeenCalled();
    });

    it('should return empty array when no available vehicles', async () => {
      prisma.vehicle.findMany.mockResolvedValue([]);

      const result = await service.getRecommendations(1);

      expect(result).toEqual([]);
    });

    it('should filter out vehicles with invalid telematics', async () => {
      prisma.vehicle.findMany.mockResolvedValue([
        {
          id: 1,
          equipmentType: 'VAN',
          assignedDriver: { driverId: 'd-1', name: 'John', status: 'ACTIVE' },
          telematics: { latitude: 0, longitude: 0, timestamp: new Date() },
        },
      ]);

      const result = await service.getRecommendations(1);

      expect(result).toEqual([]);
      expect(loadBoardService.search).not.toHaveBeenCalled();
    });

    it('should compute recommendations for valid drivers', async () => {
      prisma.vehicle.findMany.mockResolvedValue([
        {
          id: 1,
          equipmentType: 'VAN',
          assignedDriver: { driverId: 'd-1', name: 'John', status: 'ACTIVE' },
          telematics: {
            latitude: 32.78,
            longitude: -96.8,
            timestamp: new Date(),
          },
        },
      ]);

      prisma.stop.findFirst.mockResolvedValue({
        city: 'Dallas',
        state: 'TX',
        lat: 32.78,
        lon: -96.8,
      });

      loadBoardService.search.mockResolvedValue({
        listings: [{ externalId: 'l-1', origin: { city: 'Dallas', state: 'TX' } }],
      });

      const result = await service.getRecommendations(1);

      expect(result).toHaveLength(1);
      expect(result[0].driver.id).toBe('d-1');
      expect(result[0].reason).toContain('Dallas');
      expect(cache.set).toHaveBeenCalled();
    });

    it('should skip driver when reverse geocode returns null', async () => {
      prisma.vehicle.findMany.mockResolvedValue([
        {
          id: 1,
          equipmentType: 'VAN',
          assignedDriver: { driverId: 'd-1', name: 'John', status: 'ACTIVE' },
          telematics: {
            latitude: 50.0, // middle of nowhere
            longitude: -120.0,
            timestamp: new Date(),
          },
        },
      ]);

      prisma.stop.findFirst.mockResolvedValue(null);

      const result = await service.getRecommendations(1);

      expect(result).toEqual([]);
    });

    it('should handle search errors gracefully', async () => {
      prisma.vehicle.findMany.mockResolvedValue([
        {
          id: 1,
          equipmentType: 'VAN',
          assignedDriver: { driverId: 'd-1', name: 'John', status: 'ACTIVE' },
          telematics: {
            latitude: 32.78,
            longitude: -96.8,
            timestamp: new Date(),
          },
        },
      ]);

      prisma.stop.findFirst.mockResolvedValue({
        city: 'Dallas',
        state: 'TX',
      });

      loadBoardService.search.mockRejectedValue(new Error('DAT API Error'));

      const result = await service.getRecommendations(1);

      expect(result).toEqual([]);
    });
  });
});

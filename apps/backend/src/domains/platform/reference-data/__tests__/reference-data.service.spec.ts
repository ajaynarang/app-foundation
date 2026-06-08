import { ReferenceDataService } from '../reference-data.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';

describe('ReferenceDataService', () => {
  let service: ReferenceDataService;
  let prisma: any;
  let cache: any;

  const mockRows = [
    {
      category: 'equipment_type',
      code: 'dry_van',
      label: 'Dry Van',
      sortOrder: 1,
      metadata: {},
      isActive: true,
    },
    {
      category: 'equipment_type',
      code: 'reefer',
      label: 'Reefer',
      sortOrder: 2,
      metadata: {},
      isActive: true,
    },
    {
      category: 'commodity_type',
      code: 'general',
      label: 'General',
      sortOrder: 1,
      metadata: {},
      isActive: true,
    },
  ];

  beforeEach(() => {
    prisma = {
      referenceData: {
        findMany: jest.fn().mockResolvedValue(mockRows),
      },
    };

    cache = {
      getOrSet: jest.fn().mockImplementation((_key: string, factory: () => any) => factory()),
    };

    service = new ReferenceDataService(prisma as unknown as PrismaService, cache as unknown as SallyCacheService);
  });

  describe('getByCategories', () => {
    it('should return all categories when no filter', async () => {
      const result = await service.getByCategories();
      expect(Object.keys(result)).toEqual(['equipment_type', 'commodity_type']);
      expect(result['equipment_type']).toHaveLength(2);
      expect(result['commodity_type']).toHaveLength(1);
    });

    it('should return empty categories array when passed empty array', async () => {
      const result = await service.getByCategories([]);
      expect(Object.keys(result)).toEqual(['equipment_type', 'commodity_type']);
    });

    it('should filter by specific categories', async () => {
      const result = await service.getByCategories(['equipment_type']);
      expect(Object.keys(result)).toEqual(['equipment_type']);
      expect(result['equipment_type']).toHaveLength(2);
    });

    it('should return empty map for non-existent categories', async () => {
      const result = await service.getByCategories(['nonexistent']);
      expect(Object.keys(result)).toHaveLength(0);
    });

    it('should map rows correctly', async () => {
      const result = await service.getByCategories();
      expect(result['equipment_type'][0]).toEqual({
        code: 'dry_van',
        label: 'Dry Van',
        sort_order: 1,
        metadata: {},
      });
    });
  });
});

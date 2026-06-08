import { Test, TestingModule } from '@nestjs/testing';
import { TrailerMatcher } from '../trailer-matcher';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { createMockPrisma } from '../../../../../test/mocks';

describe('TrailerMatcher', () => {
  let matcher: TrailerMatcher;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [TrailerMatcher, { provide: PrismaService, useValue: prisma }],
    }).compile();

    matcher = module.get<TrailerMatcher>(TrailerMatcher);
  });

  describe('matchByExternalId', () => {
    it('should return trailer when found', async () => {
      const mockTrailer = {
        id: 1,
        tenantId: 1,
        externalTrailerId: 'ext-123',
        lifecycleStatus: 'ACTIVE',
      };

      prisma.trailer.findFirst.mockResolvedValue(mockTrailer);

      const result = await matcher.matchByExternalId(1, 'ext-123');

      expect(result).toEqual(mockTrailer);
      expect(prisma.trailer.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId: 1,
          externalTrailerId: 'ext-123',
          lifecycleStatus: { not: 'DECOMMISSIONED' },
        },
      });
    });

    it('should skip DECOMMISSIONED trailers', async () => {
      prisma.trailer.findFirst.mockResolvedValue(null);

      const result = await matcher.matchByExternalId(1, 'ext-decom');

      expect(result).toBeNull();
      expect(prisma.trailer.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId: 1,
          externalTrailerId: 'ext-decom',
          lifecycleStatus: { not: 'DECOMMISSIONED' },
        },
      });
    });
  });

  describe('matchByVin', () => {
    it('should return trailer when found', async () => {
      const mockTrailer = {
        id: 2,
        tenantId: 1,
        vin: '1UYVS2538GU819752',
      };

      prisma.trailer.findFirst.mockResolvedValue(mockTrailer);

      const result = await matcher.matchByVin(1, '1UYVS2538GU819752');

      expect(result).toEqual(mockTrailer);
      expect(prisma.trailer.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId: 1,
          vin: '1UYVS2538GU819752',
          lifecycleStatus: { not: 'DECOMMISSIONED' },
        },
      });
    });

    it('should return null for empty string', async () => {
      const result = await matcher.matchByVin(1, '');

      expect(result).toBeNull();
      expect(prisma.trailer.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('matchByLicensePlate', () => {
    it('should return trailer when found', async () => {
      const mockTrailer = {
        id: 3,
        tenantId: 1,
        licensePlate: 'TX T42-9981',
      };

      prisma.trailer.findFirst.mockResolvedValue(mockTrailer);

      const result = await matcher.matchByLicensePlate(1, 'TX T42-9981');

      expect(result).toEqual(mockTrailer);
      expect(prisma.trailer.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId: 1,
          licensePlate: 'TX T42-9981',
          lifecycleStatus: { not: 'DECOMMISSIONED' },
        },
      });
    });

    it('should return null for empty string', async () => {
      const result = await matcher.matchByLicensePlate(1, '');

      expect(result).toBeNull();
      expect(prisma.trailer.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('match', () => {
    it('should try VIN first, then license plate (cascade priority)', async () => {
      const mockTrailer = {
        id: 4,
        tenantId: 1,
        vin: '1UYVS2538GU819752',
        licensePlate: 'TX T42-9981',
      };

      prisma.trailer.findFirst.mockResolvedValue(mockTrailer);

      const result = await matcher.match(1, {
        serialNumber: '1UYVS2538GU819752',
        licensePlate: 'TX T42-9981',
      });

      expect(result).toEqual(mockTrailer);
      // Should have called matchByVin (which calls findFirst with vin)
      expect(prisma.trailer.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId: 1,
          vin: '1UYVS2538GU819752',
          lifecycleStatus: { not: 'DECOMMISSIONED' },
        },
      });
    });

    it('should return null when nothing matches', async () => {
      prisma.trailer.findFirst.mockResolvedValue(null);

      const result = await matcher.match(1, {
        serialNumber: 'UNKNOWN-VIN',
        licensePlate: 'UNKNOWN-PLATE',
      });

      expect(result).toBeNull();
    });

    it('should skip license plate check when VIN already matched', async () => {
      const mockTrailer = {
        id: 5,
        tenantId: 1,
        vin: '1UYVS2538GU819752',
      };

      prisma.trailer.findFirst.mockResolvedValue(mockTrailer);

      await matcher.match(1, {
        serialNumber: '1UYVS2538GU819752',
        licensePlate: 'TX T42-9981',
      });

      // findFirst called only once (for VIN), not twice (no license plate call)
      expect(prisma.trailer.findFirst).toHaveBeenCalledTimes(1);
    });
  });
});

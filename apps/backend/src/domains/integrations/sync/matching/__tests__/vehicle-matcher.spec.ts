import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { VehicleMatcher } from '../vehicle-matcher';

describe('VehicleMatcher', () => {
  let matcher: VehicleMatcher;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehicleMatcher,
        {
          provide: PrismaService,
          useValue: {
            vehicle: {
              findFirst: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    matcher = module.get<VehicleMatcher>(VehicleMatcher);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('matchByVin', () => {
    it('should find vehicle by VIN', async () => {
      const mockVehicle = {
        id: 1,
        vin: '1FUJGHDV9JLJY8062',
        tenantId: 1,
      };

      jest.spyOn(prisma.vehicle, 'findFirst').mockResolvedValue(mockVehicle as any);

      const result = await matcher.matchByVin(1, '1FUJGHDV9JLJY8062');

      expect(result).toEqual(mockVehicle);
      expect(prisma.vehicle.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId: 1,
          vin: '1FUJGHDV9JLJY8062',
        },
      });
    });

    it('should return null if no vehicle found', async () => {
      jest.spyOn(prisma.vehicle, 'findFirst').mockResolvedValue(null);

      const result = await matcher.matchByVin(1, 'UNKNOWN-VIN');

      expect(result).toBeNull();
    });
  });

  describe('matchByLicensePlate', () => {
    it('should find vehicle by license plate', async () => {
      const mockVehicle = {
        id: 2,
        licensePlate: 'TX R70-1836',
        tenantId: 1,
      };

      jest.spyOn(prisma.vehicle, 'findFirst').mockResolvedValue(mockVehicle as any);

      const result = await matcher.matchByLicensePlate(1, 'TX R70-1836');

      expect(result).toEqual(mockVehicle);
    });
  });

  describe('match', () => {
    it('should match by VIN first', async () => {
      const mockVehicle = {
        id: 3,
        vin: '1FUJGHDV9JLJY8062',
        licensePlate: 'TX R70-1836',
        tenantId: 1,
      };

      jest.spyOn(prisma.vehicle, 'findFirst').mockResolvedValue(mockVehicle as any);

      const result = await matcher.match(1, {
        vin: '1FUJGHDV9JLJY8062',
        licensePlate: 'TX R70-1836',
      });

      expect(result).toEqual(mockVehicle);
      expect(prisma.vehicle.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId: 1,
          vin: '1FUJGHDV9JLJY8062',
        },
      });
    });

    it('should fallback to license plate if VIN not found', async () => {
      const mockVehicle = {
        id: 4,
        licensePlate: 'TX R70-1836',
        tenantId: 1,
      };

      jest
        .spyOn(prisma.vehicle, 'findFirst')
        .mockResolvedValueOnce(null) // VIN not found
        .mockResolvedValueOnce(mockVehicle as any); // License plate found

      const result = await matcher.match(1, {
        vin: 'UNKNOWN-VIN',
        licensePlate: 'TX R70-1836',
      });

      expect(result).toEqual(mockVehicle);
    });

    it('should return null if no match found', async () => {
      jest.spyOn(prisma.vehicle, 'findFirst').mockResolvedValue(null);

      const result = await matcher.match(1, {
        vin: 'UNKNOWN-VIN',
        licensePlate: 'UNKNOWN-PLATE',
      });

      expect(result).toBeNull();
    });
  });
});

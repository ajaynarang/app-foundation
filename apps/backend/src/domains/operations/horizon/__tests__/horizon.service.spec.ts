import { Test, TestingModule } from '@nestjs/testing';
import { HorizonService } from '../horizon.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallySuggestionsService } from '../sally-suggestions/sally-suggestions.service';

describe('HorizonService', () => {
  let service: HorizonService;
  let prisma: any;
  let sallySuggestions: { generate: jest.Mock };

  beforeEach(async () => {
    prisma = {
      driver: { findMany: jest.fn() },
      load: { findMany: jest.fn() },
      driverUnavailability: { findMany: jest.fn() },
      vehicleUnavailability: { findMany: jest.fn() },
    };
    sallySuggestions = {
      generate: jest.fn().mockResolvedValue({ message: '', suggestions: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HorizonService,
        { provide: PrismaService, useValue: prisma },
        { provide: SallySuggestionsService, useValue: sallySuggestions },
      ],
    }).compile();

    service = module.get(HorizonService);
  });

  it('should return empty grid when no drivers exist', async () => {
    prisma.driver.findMany.mockResolvedValue([]);
    prisma.load.findMany.mockResolvedValue([]);
    prisma.driverUnavailability.findMany.mockResolvedValue([]);
    prisma.vehicleUnavailability.findMany.mockResolvedValue([]);

    const result = await service.getHorizon(1, '2026-04-07');
    expect(result.drivers).toEqual([]);
    expect(result.stats.totalDrivers).toBe(0);
    expect(result.stats.openDriverDays).toBe(0);
  });

  it('should place loads on correct days in driver grid', async () => {
    prisma.driver.findMany.mockResolvedValue([
      {
        id: 1,
        name: 'Mike Rivera',
        driverId: 'DRV-001',
        assignedVehicle: {
          id: 10,
          unitNumber: 'T-104',
          equipmentType: 'DRY_VAN',
        },
      },
    ]);
    prisma.load.findMany.mockResolvedValue([
      {
        loadNumber: '4521',
        status: 'ASSIGNED',
        pickupDate: new Date('2026-04-07'),
        deliveryDate: new Date('2026-04-08'),
        driverId: 1,
        originCity: 'Dallas',
        originState: 'TX',
        destinationCity: 'Memphis',
        destinationState: 'TN',
        equipmentType: 'dry_van',
        customer: { companyName: 'ABC Logistics' },
      },
    ]);
    prisma.driverUnavailability.findMany.mockResolvedValue([]);
    prisma.vehicleUnavailability.findMany.mockResolvedValue([]);

    const result = await service.getHorizon(1, '2026-04-07');
    expect(result.drivers).toHaveLength(1);
    expect(result.drivers[0].days['2026-04-07'].loads).toHaveLength(1);
    expect(result.drivers[0].days['2026-04-07'].loads[0].loadNumber).toBe('4521');
    expect(result.stats.driversLoaded).toBe(1);
  });

  it('should count open driver-days correctly', async () => {
    prisma.driver.findMany.mockResolvedValue([
      {
        id: 1,
        name: 'Mike Rivera',
        driverId: 'DRV-001',
        assignedVehicle: null,
      },
      {
        id: 2,
        name: 'James Turner',
        driverId: 'DRV-002',
        assignedVehicle: null,
      },
    ]);
    prisma.load.findMany.mockResolvedValue([]);
    prisma.driverUnavailability.findMany.mockResolvedValue([]);
    prisma.vehicleUnavailability.findMany.mockResolvedValue([]);

    const result = await service.getHorizon(1, '2026-04-07');
    // 2 drivers x 7 days = 14 open driver-days
    expect(result.stats.openDriverDays).toBe(14);
  });

  it('should place unavailability on correct days', async () => {
    prisma.driver.findMany.mockResolvedValue([
      {
        id: 1,
        name: 'Sarah Park',
        driverId: 'DRV-003',
        assignedVehicle: null,
      },
    ]);
    prisma.load.findMany.mockResolvedValue([]);
    prisma.driverUnavailability.findMany.mockResolvedValue([
      {
        id: 1,
        driverId: 1,
        type: 'PTO',
        startDate: new Date('2026-04-10'),
        endDate: new Date('2026-04-11'),
        note: 'Vacation',
        createdById: 10,
      },
    ]);
    prisma.vehicleUnavailability.findMany.mockResolvedValue([]);

    const result = await service.getHorizon(1, '2026-04-07');
    expect(result.drivers[0].days['2026-04-10'].driverUnavailability).not.toBeNull();
    expect(result.drivers[0].days['2026-04-10'].driverUnavailability?.type).toBe('PTO');
    expect(result.drivers[0].days['2026-04-11'].driverUnavailability?.type).toBe('PTO');
    // 7 - 2 unavailable = 5 open driver-days
    expect(result.stats.openDriverDays).toBe(5);
  });
});

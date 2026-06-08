import { Test, TestingModule } from '@nestjs/testing';
import { SallySuggestionsService } from '../sally-suggestions.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('SallySuggestionsService', () => {
  let service: SallySuggestionsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      load: { findMany: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [SallySuggestionsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(SallySuggestionsService);
  });

  it('should return empty suggestions when no unassigned loads exist', async () => {
    prisma.load.findMany.mockResolvedValue([]);
    const openSlots = [
      {
        driverId: 1,
        date: '2026-04-10',
        driverCity: 'Louisville',
        driverState: 'KY',
        equipmentType: 'dry_van',
      },
    ];
    const result = await service.generate(1, openSlots, '2026-04-07', '2026-04-13');
    expect(result.suggestions).toEqual([]);
  });

  it('should match load to driver with matching equipment and proximity', async () => {
    prisma.load.findMany.mockResolvedValue([
      {
        loadNumber: '100',
        status: 'PENDING',
        pickupDate: new Date('2026-04-10'),
        originCity: 'Louisville',
        originState: 'KY',
        destinationCity: 'Cincinnati',
        destinationState: 'OH',
        equipmentType: 'dry_van',
      },
    ]);
    const openSlots = [
      {
        driverId: 1,
        date: '2026-04-10',
        driverCity: 'Louisville',
        driverState: 'KY',
        equipmentType: 'dry_van',
      },
    ];
    const result = await service.generate(1, openSlots, '2026-04-07', '2026-04-13');
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions[0].matchScore).toBeGreaterThanOrEqual(70);
  });

  it('should filter out loads with equipment mismatch', async () => {
    prisma.load.findMany.mockResolvedValue([
      {
        loadNumber: '100',
        status: 'PENDING',
        pickupDate: new Date('2026-04-10'),
        originCity: 'Louisville',
        originState: 'KY',
        destinationCity: 'Cincinnati',
        destinationState: 'OH',
        equipmentType: 'reefer',
        requiredEquipmentType: 'REEFER',
      },
    ]);
    const openSlots = [
      {
        driverId: 1,
        date: '2026-04-10',
        driverCity: 'Louisville',
        driverState: 'KY',
        equipmentType: 'dry_van',
      },
    ];
    const result = await service.generate(1, openSlots, '2026-04-07', '2026-04-13');
    expect(result.suggestions).toEqual([]);
  });
});

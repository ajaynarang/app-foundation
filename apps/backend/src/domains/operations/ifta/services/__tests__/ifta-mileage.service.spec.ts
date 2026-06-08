import { Test, TestingModule } from '@nestjs/testing';
import { IftaMileageService } from '../ifta-mileage.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('IftaMileageService', () => {
  let service: IftaMileageService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      load: { findMany: jest.fn() },
      iftaStateMileage: {
        findMany: jest.fn(),
        upsert: jest.fn(),
        createMany: jest.fn(),
      },
      iftaQuarter: { findUnique: jest.fn(), create: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [IftaMileageService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(IftaMileageService);
  });

  describe('aggregateLoadMileageByState', () => {
    it('should split load miles between origin and destination states', async () => {
      prisma.load.findMany.mockResolvedValue([
        {
          id: 1,
          loadNumber: 'L-001',
          originState: 'TX',
          destinationState: 'OK',
          actualMiles: 600,
          estimatedMiles: 580,
          vehicleId: 10,
          deliveredAt: new Date('2026-02-15'),
        },
      ]);
      const result = await service.aggregateLoadMileageByState(1, 2026, 1);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ jurisdiction: 'TX', totalMiles: 300 }),
          expect.objectContaining({ jurisdiction: 'OK', totalMiles: 300 }),
        ]),
      );
    });

    it('should use estimatedMiles when actualMiles is null', async () => {
      prisma.load.findMany.mockResolvedValue([
        {
          id: 2,
          loadNumber: 'L-002',
          originState: 'CA',
          destinationState: 'CA',
          actualMiles: null,
          estimatedMiles: 200,
          vehicleId: 10,
          deliveredAt: new Date('2026-01-10'),
        },
      ]);
      const result = await service.aggregateLoadMileageByState(1, 2026, 1);
      expect(result).toEqual([expect.objectContaining({ jurisdiction: 'CA', totalMiles: 200 })]);
    });

    it('should aggregate miles across multiple loads for same state', async () => {
      prisma.load.findMany.mockResolvedValue([
        {
          id: 1,
          loadNumber: 'L-001',
          originState: 'TX',
          destinationState: 'OK',
          actualMiles: 600,
          estimatedMiles: null,
          vehicleId: 10,
          deliveredAt: new Date('2026-01-05'),
        },
        {
          id: 2,
          loadNumber: 'L-002',
          originState: 'TX',
          destinationState: 'TX',
          actualMiles: 200,
          estimatedMiles: null,
          vehicleId: 10,
          deliveredAt: new Date('2026-02-15'),
        },
      ]);
      const result = await service.aggregateLoadMileageByState(1, 2026, 1);
      const txEntry = result.find((r) => r.jurisdiction === 'TX');
      expect(txEntry?.totalMiles).toBe(500); // 300 from L-001 + 200 from L-002
    });

    it('should skip loads without origin or destination state', async () => {
      prisma.load.findMany.mockResolvedValue([
        {
          id: 1,
          loadNumber: 'L-001',
          originState: null,
          destinationState: 'TX',
          actualMiles: 400,
          estimatedMiles: null,
          vehicleId: 10,
          deliveredAt: new Date('2026-01-05'),
        },
      ]);
      const result = await service.aggregateLoadMileageByState(1, 2026, 1);
      expect(result).toEqual([]);
    });
  });

  describe('addManualMileage', () => {
    it('should upsert manual mileage entry', async () => {
      prisma.iftaQuarter.findUnique.mockResolvedValue({ id: 1 });
      prisma.iftaStateMileage.upsert.mockResolvedValue({
        id: 10,
        jurisdiction: 'IL',
        totalMiles: 1500,
        source: 'MANUAL',
      });
      const result = await service.addManualMileage(1, {
        jurisdiction: 'IL',
        totalMiles: 1500,
        year: 2026,
        quarter: 1,
      });
      expect(result.jurisdiction).toBe('IL');
      expect(result.totalMiles).toBe(1500);
    });
  });
});

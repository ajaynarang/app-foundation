import { Test, TestingModule } from '@nestjs/testing';
import { LaneAnalysisService } from '../lane-analysis.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';

const mockPrisma = { load: { findMany: jest.fn() } };
const mockCache = { getOrSet: jest.fn((_key, factory) => factory()) };

describe('LaneAnalysisService', () => {
  let service: LaneAnalysisService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LaneAnalysisService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SallyCacheService, useValue: mockCache },
      ],
    }).compile();
    service = module.get<LaneAnalysisService>(LaneAnalysisService);
  });

  it('should aggregate loads by lane', async () => {
    mockPrisma.load.findMany.mockResolvedValue([
      {
        originCity: 'Dallas',
        originState: 'TX',
        destinationCity: 'Houston',
        destinationState: 'TX',
        rateCents: 150000,
        estimatedMiles: 250,
        actualMiles: 260,
        pickupDate: new Date('2025-01-15T08:00:00Z'),
        deliveredAt: new Date('2025-01-15T16:00:00Z'),
        invoices: [],
      },
      {
        originCity: 'Dallas',
        originState: 'TX',
        destinationCity: 'Houston',
        destinationState: 'TX',
        rateCents: 160000,
        estimatedMiles: 250,
        actualMiles: null,
        pickupDate: null,
        deliveredAt: new Date('2025-01-16'),
        invoices: [{ totalCents: 165000 }],
      },
    ]);

    const result = await service.getLaneAnalysis(1, new Date(), new Date());

    expect(result).toHaveLength(1);
    expect(result[0].originCity).toBe('Dallas');
    expect(result[0].loadCount).toBe(2);
    expect(result[0].totalRevenueCents).toBe(315000);
    expect(result[0].avgTransitHours).toBe(8); // only first has transit
  });

  it('should sort by revenue descending', async () => {
    mockPrisma.load.findMany.mockResolvedValue([
      {
        originCity: 'A',
        originState: 'TX',
        destinationCity: 'B',
        destinationState: 'TX',
        rateCents: 50000,
        estimatedMiles: 100,
        actualMiles: null,
        pickupDate: null,
        deliveredAt: new Date(),
        invoices: [],
      },
      {
        originCity: 'C',
        originState: 'CA',
        destinationCity: 'D',
        destinationState: 'CA',
        rateCents: 200000,
        estimatedMiles: 300,
        actualMiles: null,
        pickupDate: null,
        deliveredAt: new Date(),
        invoices: [],
      },
    ]);

    const result = await service.getLaneAnalysis(1, new Date(), new Date());
    expect(result[0].originCity).toBe('C');
  });
});

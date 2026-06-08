import { Test, TestingModule } from '@nestjs/testing';
import { FleetUtilizationService } from '../fleet-utilization.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const mockPrisma = {
  vehicle: { findMany: jest.fn() },
  load: { findMany: jest.fn() },
};

describe('FleetUtilizationService', () => {
  let service: FleetUtilizationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [FleetUtilizationService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<FleetUtilizationService>(FleetUtilizationService);
  });

  it('should aggregate vehicle utilization', async () => {
    mockPrisma.vehicle.findMany.mockResolvedValue([
      { id: 1, unitNumber: 'T-100', equipmentType: 'DRY_VAN' },
      { id: 2, unitNumber: 'T-200', equipmentType: 'REEFER' },
    ]);
    mockPrisma.load.findMany.mockResolvedValue([
      {
        vehicleId: 1,
        rateCents: 150000,
        estimatedMiles: 500,
        actualMiles: 510,
        invoices: [{ totalCents: 155000 }],
      },
      {
        vehicleId: 1,
        rateCents: 100000,
        estimatedMiles: 300,
        actualMiles: null,
        invoices: [],
      },
    ]);

    const result = await service.getFleetUtilization(1, new Date(), new Date());

    expect(result).toHaveLength(1); // vehicle 2 has no loads
    expect(result[0].unitNumber).toBe('T-100');
    expect(result[0].loadCount).toBe(2);
    expect(result[0].totalMiles).toBe(810);
    expect(result[0].revenueCents).toBe(255000);
    expect(result[0].revenuePerMileCents).toBeGreaterThan(0);
  });

  it('should handle no loads', async () => {
    mockPrisma.vehicle.findMany.mockResolvedValue([{ id: 1, unitNumber: 'T-1', equipmentType: null }]);
    mockPrisma.load.findMany.mockResolvedValue([]);
    const result = await service.getFleetUtilization(1, new Date(), new Date());
    expect(result).toHaveLength(0);
  });
});

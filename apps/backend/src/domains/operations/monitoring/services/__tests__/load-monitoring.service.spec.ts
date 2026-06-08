import { Test, TestingModule } from '@nestjs/testing';
import { LoadMonitoringService } from '../load-monitoring.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { MonitoringEngineService } from '../monitoring-engine.service';

const mockPrisma = {
  load: {
    groupBy: jest.fn(),
  },
};

const mockEngine = {
  runCycleForTenant: jest.fn(),
};

describe('LoadMonitoringService', () => {
  let service: LoadMonitoringService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoadMonitoringService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MonitoringEngineService, useValue: mockEngine },
      ],
    }).compile();

    service = module.get<LoadMonitoringService>(LoadMonitoringService);
  });

  it('should return early when no active tenants', async () => {
    mockPrisma.load.groupBy.mockResolvedValue([]);

    await service.monitorActiveLoads();

    expect(mockEngine.runCycleForTenant).not.toHaveBeenCalled();
  });

  it('should run monitoring cycle for each tenant', async () => {
    mockPrisma.load.groupBy.mockResolvedValue([{ tenantId: 1 }, { tenantId: 2 }]);
    mockEngine.runCycleForTenant.mockResolvedValue(undefined);

    await service.monitorActiveLoads();

    expect(mockEngine.runCycleForTenant).toHaveBeenCalledTimes(2);
    expect(mockEngine.runCycleForTenant).toHaveBeenCalledWith(1);
    expect(mockEngine.runCycleForTenant).toHaveBeenCalledWith(2);
  });

  it('should continue processing other tenants when one fails', async () => {
    mockPrisma.load.groupBy.mockResolvedValue([{ tenantId: 1 }, { tenantId: 2 }]);
    mockEngine.runCycleForTenant.mockRejectedValueOnce(new Error('Tenant 1 error')).mockResolvedValueOnce(undefined);

    await service.monitorActiveLoads();

    expect(mockEngine.runCycleForTenant).toHaveBeenCalledTimes(2);
  });

  it('should skip when previous cycle is still running', async () => {
    mockPrisma.load.groupBy.mockResolvedValue([{ tenantId: 1 }]);

    // Simulate a long-running cycle
    let resolveFirst: () => void;
    const firstPromise = new Promise<void>((r) => (resolveFirst = r));
    mockEngine.runCycleForTenant.mockReturnValueOnce(firstPromise);

    // Start first cycle
    const firstCycle = service.monitorActiveLoads();

    // Start second cycle while first is running
    await service.monitorActiveLoads();

    // First cycle was still processing, second should have been skipped
    resolveFirst();
    await firstCycle;

    expect(mockEngine.runCycleForTenant).toHaveBeenCalledTimes(1);
  });

  it('should reset running flag after error', async () => {
    mockPrisma.load.groupBy.mockRejectedValueOnce(new Error('DB error')).mockResolvedValueOnce([]);

    // First call fails
    await service.monitorActiveLoads().catch(() => {});

    // Second call should not be skipped
    await service.monitorActiveLoads();

    // groupBy should have been called twice (once for each monitorActiveLoads call)
    expect(mockPrisma.load.groupBy).toHaveBeenCalledTimes(2);
  });
});

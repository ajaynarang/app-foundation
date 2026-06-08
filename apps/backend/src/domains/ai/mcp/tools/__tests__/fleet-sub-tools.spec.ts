import { DriverQueryTool } from '../fleet/driver-query.tool';
import { VehicleQueryTool } from '../fleet/vehicle-query.tool';
import { LaneActionTool } from '../fleet/lane-action.tool';
import { LoadReadTool } from '../fleet/load-read.tool';
import { StopActionTool } from '../fleet/stop-action.tool';
import { AlertCreateTool } from '../alerts/alert-create.tool';

describe('DriverQueryTool', () => {
  let tool: DriverQueryTool;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      driver: {
        findMany: jest.fn().mockResolvedValue([
          {
            driverId: 'drv_1',
            name: 'John',
            status: 'ACTIVE',
            phone: '555',
            email: 'j@t.com',
            assignedVehicle: { unitNumber: 'TRK-101' },
          },
        ]),
        findFirst: jest.fn().mockResolvedValue({
          driverId: 'drv_1',
          name: 'John',
          status: 'ACTIVE',
          phone: '555',
          email: 'j@t.com',
          cdlNumber: 'CDL1',
          cdlState: 'TX',
          cdlExpiration: new Date(),
          medicalCardExpiration: new Date(),
          assignedVehicle: { unitNumber: 'TRK-101', vehicleId: 'veh_1' },
        }),
      },
    };
    tool = new DriverQueryTool(mockPrisma);
  });

  it('queryDrivers returns error without tenant', async () => {
    const r = await tool.queryDrivers({ limit: 20 });
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('queryDrivers returns drivers with tenant', async () => {
    const r = await tool.queryDrivers({ limit: 20, _tenantId: 1 });
    const data = JSON.parse(r.content[0].text);
    expect(data.count).toBe(1);
  });

  it('getDriverDetail returns error without tenant', async () => {
    const r = await tool.getDriverDetail({ driverName: 'John' });
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('getDriverDetail returns driver with tenant', async () => {
    const r = await tool.getDriverDetail({ driverName: 'John', _tenantId: 1 });
    const data = JSON.parse(r.content[0].text);
    expect(data.name).toBe('John');
  });
});

describe('VehicleQueryTool', () => {
  let tool: VehicleQueryTool;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      vehicle: {
        findMany: jest.fn().mockResolvedValue([
          {
            vehicleId: 'veh_1',
            unitNumber: 'TRK-101',
            status: 'AVAILABLE',
            make: 'Freightliner',
            model: 'Cascadia',
            year: 2023,
            fuelType: 'diesel',
            assignedDriver: null,
          },
        ]),
        findFirst: jest.fn().mockResolvedValue({
          vehicleId: 'veh_1',
          unitNumber: 'TRK-101',
          status: 'AVAILABLE',
          make: 'Freightliner',
          model: 'Cascadia',
          year: 2023,
          fuelType: 'diesel',
          currentMileage: 150000,
          assignedDriver: { name: 'John', driverId: 'drv_1' },
        }),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    tool = new VehicleQueryTool(mockPrisma);
  });

  it('queryVehicles returns error without tenant', async () => {
    const r = await tool.queryVehicles({ limit: 20 });
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('queryVehicles returns vehicles with tenant', async () => {
    const r = await tool.queryVehicles({ limit: 20, _tenantId: 1 });
    expect(JSON.parse(r.content[0].text).count).toBe(1);
  });

  it('getVehicleDetail returns error without tenant', async () => {
    const r = await tool.getVehicleDetail({ vehicleUnit: 'TRK-101' });
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('getVehicleDetail returns vehicle with tenant', async () => {
    const r = await tool.getVehicleDetail({
      vehicleUnit: 'TRK-101',
      _tenantId: 1,
    });
    expect(JSON.parse(r.content[0].text).unitNumber).toBe('TRK-101');
  });
});

describe('LaneActionTool', () => {
  let tool: LaneActionTool;

  beforeEach(() => {
    tool = new LaneActionTool(
      {
        recurringLane: {
          findFirst: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
        },
        load: { findFirst: jest.fn() },
        driver: { findMany: jest.fn().mockResolvedValue([]) },
        vehicle: { findMany: jest.fn().mockResolvedValue([]) },
      } as any,
      { generateLoadFromLane: jest.fn() } as any,
    );
  });

  it('generateLoadFromLane returns error without tenant', async () => {
    const r = await tool.generateLoadFromLane({ laneId: 1 });
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });
});

describe('LoadReadTool', () => {
  let tool: LoadReadTool;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      load: { findFirst: jest.fn() },
    };
    tool = new LoadReadTool(mockPrisma);
  });

  it('getLoadDetail returns error without tenant', async () => {
    const r = await tool.getLoadDetail({ loadNumber: 'L-1001' });
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  it('getLoadDetail returns error for not found', async () => {
    mockPrisma.load.findFirst.mockResolvedValue(null);
    const r = await tool.getLoadDetail({ loadNumber: 'L-1001', _tenantId: 1 });
    expect(JSON.parse(r.content[0].text).error).toBeDefined();
  });

  // Positive path needs deep prisma mock with document count — tested via integration
});

describe('StopActionTool', () => {
  let tool: StopActionTool;
  let mockPrisma: any;
  let mockLoadsService: any;

  const mockLoad = {
    loadNumber: 'L-1001',
    stops: [
      {
        id: 101,
        sequenceOrder: 1,
        status: 'COMPLETED',
        stop: { name: 'Dallas WH', address: '123 Main St', city: 'Dallas' },
      },
      {
        id: 102,
        sequenceOrder: 2,
        status: 'PENDING',
        stop: { name: 'Houston DC', address: '456 Oak Ave', city: 'Houston' },
      },
      {
        id: 103,
        sequenceOrder: 3,
        status: 'PENDING',
        stop: { name: 'Austin WH', address: '789 Elm St', city: 'Austin' },
      },
    ],
  };

  beforeEach(() => {
    mockPrisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ driverId: 42, id: 1 }),
      },
      load: {
        findFirst: jest.fn().mockResolvedValue(mockLoad),
      },
    };
    mockLoadsService = {
      updateStopStatus: jest.fn().mockResolvedValue(undefined),
    };
    tool = new StopActionTool(mockPrisma, mockLoadsService);
  });

  it('updateStopStatus returns error without userId', async () => {
    const r = await tool.updateStopStatus({ status: 'ARRIVED' });
    expect(JSON.parse(r.content[0].text).error).toContain('No authenticated session');
  });

  it('updateStopStatus returns error without tenant', async () => {
    const r = await tool.updateStopStatus({
      status: 'ARRIVED',
      _userId: 'uid',
    });
    expect(JSON.parse(r.content[0].text).error).toContain('no tenant context');
  });

  it('updateStopStatus returns error when user has no driver profile', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ driverId: null });
    const r = await tool.updateStopStatus({
      status: 'ARRIVED',
      _tenantId: 1,
      _userId: 'uid',
    });
    expect(JSON.parse(r.content[0].text).error).toContain('not linked to a driver');
  });

  it('updateStopStatus returns error when no active load', async () => {
    mockPrisma.load.findFirst.mockResolvedValue(null);
    const r = await tool.updateStopStatus({
      status: 'ARRIVED',
      _tenantId: 1,
      _userId: 'uid',
    });
    expect(JSON.parse(r.content[0].text).error).toContain('No active load');
  });

  it('updateStopStatus auto-detects next pending stop for ARRIVED', async () => {
    const r = await tool.updateStopStatus({
      status: 'ARRIVED',
      _tenantId: 1,
      _userId: 'uid',
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.stopName).toBe('Houston DC');
    expect(parsed.status).toBe('ARRIVED');
    expect(mockLoadsService.updateStopStatus).toHaveBeenCalledWith('L-1001', 102, 'ARRIVED', 'uid', 1);
  });

  it('updateStopStatus finds stop by description', async () => {
    const r = await tool.updateStopStatus({
      status: 'ARRIVED',
      stopDescription: 'Austin',
      _tenantId: 1,
      _userId: 'uid',
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.stopName).toBe('Austin WH');
  });

  it('updateStopStatus returns error when stop description not matched', async () => {
    const r = await tool.updateStopStatus({
      status: 'ARRIVED',
      stopDescription: 'Chicago',
      _tenantId: 1,
      _userId: 'uid',
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toContain('No stop found matching');
  });

  it('updateStopStatus auto-detects ARRIVED stop for IN_PROGRESS', async () => {
    mockPrisma.load.findFirst.mockResolvedValue({
      ...mockLoad,
      stops: [
        { id: 101, sequenceOrder: 1, status: 'COMPLETED', stop: { name: 'A' } },
        { id: 102, sequenceOrder: 2, status: 'ARRIVED', stop: { name: 'B' } },
      ],
    });
    const r = await tool.updateStopStatus({
      status: 'IN_PROGRESS',
      _tenantId: 1,
      _userId: 'uid',
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.stopName).toBe('B');
  });

  it('updateStopStatus auto-detects IN_PROGRESS stop for COMPLETED', async () => {
    mockPrisma.load.findFirst.mockResolvedValue({
      ...mockLoad,
      stops: [
        { id: 101, sequenceOrder: 1, status: 'COMPLETED', stop: { name: 'A' } },
        {
          id: 102,
          sequenceOrder: 2,
          status: 'IN_PROGRESS',
          stop: { name: 'B' },
        },
      ],
    });
    const r = await tool.updateStopStatus({
      status: 'COMPLETED',
      _tenantId: 1,
      _userId: 'uid',
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.stopName).toBe('B');
  });

  it('updateStopStatus returns error when no stop ready for transition', async () => {
    mockPrisma.load.findFirst.mockResolvedValue({
      ...mockLoad,
      stops: [{ id: 101, sequenceOrder: 1, status: 'COMPLETED', stop: { name: 'A' } }],
    });
    const r = await tool.updateStopStatus({
      status: 'ARRIVED',
      _tenantId: 1,
      _userId: 'uid',
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toContain('No stop ready for');
  });

  it('updateStopStatus handles service error', async () => {
    mockLoadsService.updateStopStatus.mockRejectedValue(new Error('Invalid transition'));
    const r = await tool.updateStopStatus({
      status: 'ARRIVED',
      _tenantId: 1,
      _userId: 'uid',
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toContain('Invalid transition');
  });

  it('updateStopStatus uses stop sequence number when no name', async () => {
    mockPrisma.load.findFirst.mockResolvedValue({
      ...mockLoad,
      stops: [{ id: 101, sequenceOrder: 1, status: 'PENDING', stop: { name: null } }],
    });
    const r = await tool.updateStopStatus({
      status: 'ARRIVED',
      _tenantId: 1,
      _userId: 'uid',
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.stopName).toBe('Stop #1');
  });
});

describe('AlertCreateTool', () => {
  let tool: AlertCreateTool;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        // Phase 2 Task 10 — user.driverId is the Int FK to drivers.id.
        findFirst: jest.fn().mockResolvedValue({ driverId: 42, id: 1 }),
      },
      driver: {
        findUnique: jest.fn().mockResolvedValue({
          driverId: 'drv_1',
          name: 'John Smith',
          assignedVehicleId: 10,
        }),
      },
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({ vehicleId: 'veh_1' }),
      },
      load: {
        // Tool now reads load.id (Int FK) alongside loadNumber.
        findFirst: jest.fn().mockResolvedValue({
          id: 99,
          loadNumber: 'L-1001',
        }),
      },
      alert: {
        create: jest.fn().mockResolvedValue({ alertId: 'alt_abc123', status: 'active' }),
      },
    };
    tool = new AlertCreateTool(mockPrisma);
  });

  it('reportIssue returns error without userId', async () => {
    const r = await tool.reportIssue({
      description: 'Flat tire',
      inferredCategory: 'mechanical',
      inferredPriority: 'high',
    });
    expect(JSON.parse(r.content[0].text).error).toContain('No authenticated session');
  });

  it('reportIssue returns error without tenant', async () => {
    const r = await tool.reportIssue({
      description: 'Flat tire',
      inferredCategory: 'mechanical',
      inferredPriority: 'high',
      _userId: 'uid',
    });
    expect(JSON.parse(r.content[0].text).error).toContain('no tenant context');
  });

  it('reportIssue returns error when user has no driver profile', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ driverId: null, id: 1 });
    const r = await tool.reportIssue({
      description: 'Flat tire',
      inferredCategory: 'mechanical',
      inferredPriority: 'high',
      _tenantId: 1,
      _userId: 'uid',
    });
    expect(JSON.parse(r.content[0].text).error).toContain('not linked to a driver');
  });

  it('reportIssue returns error when user not found', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const r = await tool.reportIssue({
      description: 'Flat tire',
      inferredCategory: 'mechanical',
      inferredPriority: 'high',
      _tenantId: 1,
      _userId: 'uid',
    });
    expect(JSON.parse(r.content[0].text).error).toContain('not linked to a driver');
  });

  it('reportIssue returns error when driver not found', async () => {
    mockPrisma.driver.findUnique.mockResolvedValue(null);
    const r = await tool.reportIssue({
      description: 'Flat tire',
      inferredCategory: 'mechanical',
      inferredPriority: 'high',
      _tenantId: 1,
      _userId: 'uid',
    });
    expect(JSON.parse(r.content[0].text).error).toContain('Driver profile not found');
  });

  it('reportIssue creates alert with mechanical category', async () => {
    const r = await tool.reportIssue({
      description: 'Flat tire on I-35',
      inferredCategory: 'mechanical',
      inferredPriority: 'critical',
      _tenantId: 1,
      _userId: 'uid',
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.category).toBe('mechanical');
    expect(parsed.priority).toBe('critical');
    expect(parsed.loadNumber).toBe('L-1001');
    expect(mockPrisma.alert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          alertType: 'MECHANICAL_ISSUE',
          priority: 'CRITICAL',
          // Phase 2 Task 10 — alert.driverId / loadId / vehicleId are Int FKs.
          // user.driverId=42, vehicle.assignedVehicleId=10, load.id=99.
          driverId: 42,
          vehicleId: 10,
          loadId: 99,
        }),
      }),
    );
  });

  it('reportIssue creates alert with delay category', async () => {
    await tool.reportIssue({
      description: 'Shipper not ready',
      inferredCategory: 'delay',
      inferredPriority: 'medium',
      _tenantId: 1,
      _userId: 'uid',
    });
    expect(mockPrisma.alert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          alertType: 'DELAY_REPORT',
          priority: 'MEDIUM',
        }),
      }),
    );
  });

  it('reportIssue creates alert with safety category', async () => {
    await tool.reportIssue({
      description: 'Unsafe road conditions',
      inferredCategory: 'safety',
      inferredPriority: 'high',
      _tenantId: 1,
      _userId: 'uid',
    });
    expect(mockPrisma.alert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          alertType: 'SAFETY_CONCERN',
          priority: 'HIGH',
        }),
      }),
    );
  });

  it('reportIssue creates alert with administrative category', async () => {
    await tool.reportIssue({
      description: 'Missing paperwork',
      inferredCategory: 'administrative',
      inferredPriority: 'low',
      _tenantId: 1,
      _userId: 'uid',
    });
    expect(mockPrisma.alert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          alertType: 'ADMINISTRATIVE_ISSUE',
          priority: 'LOW',
        }),
      }),
    );
  });

  it('reportIssue handles no assigned vehicle', async () => {
    mockPrisma.driver.findUnique.mockResolvedValue({
      driverId: 'drv_1',
      name: 'John Smith',
      assignedVehicleId: null,
    });
    const r = await tool.reportIssue({
      description: 'Issue',
      inferredCategory: 'delay',
      inferredPriority: 'low',
      _tenantId: 1,
      _userId: 'uid',
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.success).toBe(true);
    expect(mockPrisma.alert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ vehicleId: null }),
      }),
    );
  });

  it('reportIssue handles no active load', async () => {
    mockPrisma.load.findFirst.mockResolvedValue(null);
    const r = await tool.reportIssue({
      description: 'Issue',
      inferredCategory: 'delay',
      inferredPriority: 'low',
      _tenantId: 1,
      _userId: 'uid',
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.loadNumber).toBeUndefined();
    expect(mockPrisma.alert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ loadId: null }),
      }),
    );
  });

  it('reportIssue handles alert create error', async () => {
    mockPrisma.alert.create.mockRejectedValue(new Error('DB error'));
    const r = await tool.reportIssue({
      description: 'Issue',
      inferredCategory: 'delay',
      inferredPriority: 'low',
      _tenantId: 1,
      _userId: 'uid',
    });
    const parsed = JSON.parse(r.content[0].text);
    expect(parsed.error).toContain('Failed to create alert');
  });
});

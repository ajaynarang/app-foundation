import { Test, TestingModule } from '@nestjs/testing';
import { DispatchBoardService } from '../dispatch-board.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../../infrastructure/cache/sally-cache.service';

describe('DispatchBoardService', () => {
  let service: DispatchBoardService;

  const mockPrismaService = {
    driver: {
      findMany: jest.fn(),
    },
    driverUnavailability: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const mockCacheService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    getOrSet: jest.fn().mockImplementation((_key: string, factory: () => any) => factory()),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatchBoardService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SallyCacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<DispatchBoardService>(DispatchBoardService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDispatchBoard', () => {
    const tenantId = 1;

    const mockDrivers = [
      {
        id: 1,
        driverId: 'DRV-001',
        name: 'John Smith',
        phone: '555-0100',
        status: 'ACTIVE',
        currentHoursDriven: 3.0,
        currentOnDutyTime: 5.0,
        cycleHoursUsed: 40.0,
        currentHoursSinceBreak: 2.0,
        hosDataSyncedAt: new Date('2026-02-23T12:00:00Z'),
        homeTerminalCity: 'Dallas',
        homeTerminalState: 'TX',
        loads: [
          {
            loadNumber: 'LD-20260223-001',
            customerName: 'Acme Corp',
            status: 'IN_TRANSIT',
            originCity: 'Chicago',
            originState: 'IL',
            destinationCity: 'Dallas',
            destinationState: 'TX',
            vehicle: {
              unitNumber: '4521',
              equipmentType: 'DRY_VAN',
            },
          },
        ],
      },
      {
        id: 2,
        driverId: 'DRV-002',
        name: 'Karen Jones',
        phone: '555-0200',
        status: 'ACTIVE',
        currentHoursDriven: 0.0,
        currentOnDutyTime: 0.0,
        cycleHoursUsed: 20.0,
        currentHoursSinceBreak: 0.0,
        hosDataSyncedAt: new Date('2026-02-23T12:00:00Z'),
        homeTerminalCity: 'Atlanta',
        homeTerminalState: 'GA',
        loads: [],
      },
    ];

    it('should return all drivers with summary', async () => {
      mockPrismaService.driver.findMany.mockResolvedValue(mockDrivers);

      const result = await service.getDispatchBoard(tenantId, {});

      expect(result.drivers).toHaveLength(2);
      expect(result.summary.total).toBe(2);
      expect(result.summary.onLoad).toBe(1);
      expect(result.summary.available).toBe(1);
    });

    it('should map driver on load correctly', async () => {
      mockPrismaService.driver.findMany.mockResolvedValue(mockDrivers);

      const result = await service.getDispatchBoard(tenantId, {});
      const onLoadDriver = result.drivers.find((d) => d.driverId === 'DRV-001');

      expect(onLoadDriver.status).toBe('onLoad');
      expect(onLoadDriver.currentLoad).toEqual({
        loadNumber: 'LD-20260223-001',
        customerName: 'Acme Corp',
        status: 'IN_TRANSIT',
        origin: 'Chicago, IL',
        destination: 'Dallas, TX',
      });
      expect(onLoadDriver.vehicle).toEqual({
        unitNumber: '4521',
        equipmentType: 'DRY_VAN',
      });
    });

    it('should map available driver correctly', async () => {
      mockPrismaService.driver.findMany.mockResolvedValue(mockDrivers);

      const result = await service.getDispatchBoard(tenantId, {});
      const availDriver = result.drivers.find((d) => d.driverId === 'DRV-002');

      expect(availDriver.status).toBe('available');
      expect(availDriver.currentLoad).toBeNull();
      expect(availDriver.vehicle).toBeNull();
    });

    it('should compute HOS remaining hours', async () => {
      mockPrismaService.driver.findMany.mockResolvedValue(mockDrivers);

      const result = await service.getDispatchBoard(tenantId, {});
      const driver = result.drivers.find((d) => d.driverId === 'DRV-001');

      // 11h max drive - 3h driven = 8h remaining
      expect(driver.hos.driveRemainingHours).toBe(8);
      // 14h max duty - 5h on duty = 9h remaining
      expect(driver.hos.dutyRemainingHours).toBe(9);
      // 8h max break - 2h since break = 6h remaining
      expect(driver.hos.breakRemainingHours).toBe(6);
      expect(driver.hos.isCritical).toBe(false);
    });

    it('should flag HOS critical when drive remaining < 2h', async () => {
      const criticalDrivers = [
        {
          ...mockDrivers[0],
          currentHoursDriven: 9.5, // 11 - 9.5 = 1.5h remaining
          loads: [mockDrivers[0].loads[0]],
        },
      ];
      mockPrismaService.driver.findMany.mockResolvedValue(criticalDrivers);

      const result = await service.getDispatchBoard(tenantId, {});

      expect(result.drivers[0].hos.isCritical).toBe(true);
      expect(result.summary.hosCritical).toBe(1);
    });

    it('should flag HOS critical when break remaining < 2h', async () => {
      const breakCriticalDrivers = [
        {
          ...mockDrivers[0],
          currentHoursSinceBreak: 7.0, // 8 - 7 = 1h remaining
          loads: [mockDrivers[0].loads[0]],
        },
      ];
      mockPrismaService.driver.findMany.mockResolvedValue(breakCriticalDrivers);

      const result = await service.getDispatchBoard(tenantId, {});

      expect(result.drivers[0].hos.breakRemainingHours).toBe(1);
      expect(result.drivers[0].hos.isCritical).toBe(true);
      expect(result.summary.hosCritical).toBe(1);
    });

    it('should filter by status=available', async () => {
      mockPrismaService.driver.findMany.mockResolvedValue(mockDrivers);

      const result = await service.getDispatchBoard(tenantId, {
        filter: 'available',
      });

      expect(result.drivers).toHaveLength(1);
      expect(result.drivers[0].driverId).toBe('DRV-002');
      // Summary counts total (before filter)
      expect(result.summary.total).toBe(2);
    });

    it('should filter by status=onLoad', async () => {
      mockPrismaService.driver.findMany.mockResolvedValue(mockDrivers);

      const result = await service.getDispatchBoard(tenantId, {
        filter: 'onLoad',
      });

      expect(result.drivers).toHaveLength(1);
      expect(result.drivers[0].driverId).toBe('DRV-001');
    });

    it('should filter by status=hosCritical', async () => {
      const criticalDrivers = [
        {
          ...mockDrivers[0],
          currentHoursDriven: 9.5,
          loads: [mockDrivers[0].loads[0]],
        },
        mockDrivers[1],
      ];
      mockPrismaService.driver.findMany.mockResolvedValue(criticalDrivers);

      const result = await service.getDispatchBoard(tenantId, {
        filter: 'hosCritical',
      });

      expect(result.drivers).toHaveLength(1);
      expect(result.drivers[0].hos.isCritical).toBe(true);
    });

    it('should filter by search term matching driver name', async () => {
      mockPrismaService.driver.findMany.mockResolvedValue(mockDrivers);

      const result = await service.getDispatchBoard(tenantId, {
        search: 'john',
      });

      expect(result.drivers).toHaveLength(1);
      expect(result.drivers[0].name).toBe('John Smith');
    });

    it('should filter by search term matching load number', async () => {
      mockPrismaService.driver.findMany.mockResolvedValue(mockDrivers);

      const result = await service.getDispatchBoard(tenantId, {
        search: 'LD-20260223',
      });

      expect(result.drivers).toHaveLength(1);
      expect(result.drivers[0].driverId).toBe('DRV-001');
    });

    it('should filter by search term matching vehicle unit number', async () => {
      mockPrismaService.driver.findMany.mockResolvedValue(mockDrivers);

      const result = await service.getDispatchBoard(tenantId, {
        search: '4521',
      });

      expect(result.drivers).toHaveLength(1);
      expect(result.drivers[0].driverId).toBe('DRV-001');
    });

    it('should sort by name ascending by default', async () => {
      mockPrismaService.driver.findMany.mockResolvedValue(mockDrivers);

      const result = await service.getDispatchBoard(tenantId, {});
      const names = result.drivers.map((d) => d.name);

      expect(names).toEqual(['John Smith', 'Karen Jones']);
    });

    it('should sort by hosRemaining ascending', async () => {
      mockPrismaService.driver.findMany.mockResolvedValue(mockDrivers);

      const result = await service.getDispatchBoard(tenantId, {
        sortBy: 'hosRemaining',
        sortOrder: 'asc',
      });

      // onLoad (8h drive remaining) before available (no HOS data → Infinity)
      expect(result.drivers[0].driverId).toBe('DRV-001'); // 8h
      expect(result.drivers[1].driverId).toBe('DRV-002'); // 11h
    });

    it('should return location from home terminal', async () => {
      mockPrismaService.driver.findMany.mockResolvedValue(mockDrivers);

      const result = await service.getDispatchBoard(tenantId, {});
      const driver = result.drivers.find((d) => d.driverId === 'DRV-001');

      expect(driver.location).toEqual({ city: 'Dallas', state: 'TX' });
    });

    it('should return null location when no home terminal', async () => {
      const noLocationDrivers = [
        {
          ...mockDrivers[0],
          homeTerminalCity: null,
          homeTerminalState: null,
          loads: [mockDrivers[0].loads[0]],
        },
      ];
      mockPrismaService.driver.findMany.mockResolvedValue(noLocationDrivers);

      const result = await service.getDispatchBoard(tenantId, {});

      expect(result.drivers[0].location).toBeNull();
    });

    it("should set status to unavailable when driver has today's unavailability", async () => {
      const availableDriver = {
        ...mockDrivers[1], // Karen Jones, no loads
        id: 2,
      };
      mockPrismaService.driver.findMany.mockResolvedValue([availableDriver]);
      mockPrismaService.driverUnavailability.findMany.mockResolvedValue([
        {
          id: 1,
          driverId: 2,
          type: 'VACATION',
          startDate: new Date('2026-02-22'),
          endDate: new Date('2026-02-24'),
          tenantId: 1,
        },
      ]);

      const result = await service.getDispatchBoard(tenantId, {});

      expect(result.drivers[0].status).toBe('unavailable');
      expect(result.drivers[0].unavailability).toEqual(expect.objectContaining({ type: 'VACATION' }));
    });

    it('should include unavailable count in summary', async () => {
      const availableDriver = {
        ...mockDrivers[1],
        id: 2,
      };
      mockPrismaService.driver.findMany.mockResolvedValue([availableDriver]);
      mockPrismaService.driverUnavailability.findMany.mockResolvedValue([
        {
          id: 1,
          driverId: 2,
          type: 'VACATION',
          startDate: new Date('2026-02-22'),
          endDate: new Date('2026-02-24'),
          tenantId: 1,
        },
      ]);

      const result = await service.getDispatchBoard(tenantId, {});

      expect(result.summary.unavailable).toBe(1);
    });

    it('should prioritize onLoad over unavailable', async () => {
      const driverWithLoad = {
        ...mockDrivers[0], // John Smith, has loads
        id: 1,
      };
      mockPrismaService.driver.findMany.mockResolvedValue([driverWithLoad]);
      mockPrismaService.driverUnavailability.findMany.mockResolvedValue([
        {
          id: 1,
          driverId: 1,
          type: 'VACATION',
          startDate: new Date('2026-02-22'),
          endDate: new Date('2026-02-24'),
          tenantId: 1,
        },
      ]);

      const result = await service.getDispatchBoard(tenantId, {});

      expect(result.drivers[0].status).toBe('onLoad');
    });
  });
});

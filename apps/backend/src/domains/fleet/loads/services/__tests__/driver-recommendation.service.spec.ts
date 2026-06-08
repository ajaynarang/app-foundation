import { Test, TestingModule } from '@nestjs/testing';
import { DriverRecommendationService, MatchScoreInput, RationaleInput } from '../driver-recommendation.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { IntegrationDataService } from '../../../../integrations/services/integration-data.service';

const mockPrisma = {
  load: {
    findFirst: jest.fn(),
  },
  driver: {
    findMany: jest.fn(),
  },
  driverUnavailability: {
    findMany: jest.fn().mockResolvedValue([]),
  },
};

const mockIntegrationData = {
  getDriverHOS: jest.fn(),
  getVehicleLocation: jest.fn(),
};

describe('DriverRecommendationService', () => {
  let service: DriverRecommendationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverRecommendationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: IntegrationDataService, useValue: mockIntegrationData },
      ],
    }).compile();

    service = module.get<DriverRecommendationService>(DriverRecommendationService);

    jest.clearAllMocks();
  });

  // ── calculateMatchScore ────────────────────────────────────────────────────

  describe('calculateMatchScore', () => {
    const baseInput: MatchScoreInput = {
      equipmentMatch: true,
      driveHoursRemaining: 11,
      distanceMiles: 0,
      isAvailable: true,
      activeLoadCount: 0,
    };

    it('returns 100 for a perfect match (full HOS, at pickup, available, equipment match)', () => {
      const score = service.calculateMatchScore(baseInput);
      // equipment 30 + HOS 25 + proximity 25 + availability 10 + load count 10 = 100
      expect(score).toBe(100);
    });

    it('equipment match adds 30 points vs no match', () => {
      const withMatch = service.calculateMatchScore({
        ...baseInput,
        equipmentMatch: true,
      });
      const withoutMatch = service.calculateMatchScore({
        ...baseInput,
        equipmentMatch: false,
      });
      expect(withMatch - withoutMatch).toBe(30);
    });

    it('closer driver scores higher on proximity', () => {
      const near = service.calculateMatchScore({
        ...baseInput,
        distanceMiles: 50,
      });
      const far = service.calculateMatchScore({
        ...baseInput,
        distanceMiles: 400,
      });
      expect(near).toBeGreaterThan(far);
    });

    it('driver at 500+ miles gets 0 proximity points', () => {
      const score = service.calculateMatchScore({
        ...baseInput,
        equipmentMatch: false,
        driveHoursRemaining: 0,
        distanceMiles: 600,
        isAvailable: false,
        activeLoadCount: 0,
      });
      // proximity capped at 0 since distance > 500
      // only load count score = 10
      expect(score).toBe(10);
    });

    it('more HOS drive hours scores higher', () => {
      const fullHos = service.calculateMatchScore({
        ...baseInput,
        driveHoursRemaining: 11,
      });
      const halfHos = service.calculateMatchScore({
        ...baseInput,
        driveHoursRemaining: 5.5,
      });
      const noHos = service.calculateMatchScore({
        ...baseInput,
        driveHoursRemaining: 0,
      });
      expect(fullHos).toBeGreaterThan(halfHos);
      expect(halfHos).toBeGreaterThan(noHos);
    });

    it('available driver scores 10 more than on_load driver', () => {
      const available = service.calculateMatchScore({
        ...baseInput,
        isAvailable: true,
      });
      const onLoad = service.calculateMatchScore({
        ...baseInput,
        isAvailable: false,
      });
      expect(available - onLoad).toBe(10);
    });

    it('fewer active loads scores higher', () => {
      const noLoads = service.calculateMatchScore({
        ...baseInput,
        activeLoadCount: 0,
      });
      const oneLoad = service.calculateMatchScore({
        ...baseInput,
        activeLoadCount: 1,
      });
      const twoLoads = service.calculateMatchScore({
        ...baseInput,
        activeLoadCount: 2,
      });
      expect(noLoads).toBeGreaterThan(oneLoad);
      expect(oneLoad).toBeGreaterThan(twoLoads);
    });

    it('active load count score floors at 0 (never negative)', () => {
      const score = service.calculateMatchScore({
        ...baseInput,
        activeLoadCount: 10,
      });
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('HOS score is capped at 25 even if drive hours exceed 11', () => {
      const over = service.calculateMatchScore({
        ...baseInput,
        driveHoursRemaining: 20,
      });
      const atMax = service.calculateMatchScore({
        ...baseInput,
        driveHoursRemaining: 11,
      });
      expect(over).toBe(atMax);
    });

    it('total score never exceeds 100', () => {
      const score = service.calculateMatchScore(baseInput);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('total score is never negative', () => {
      const score = service.calculateMatchScore({
        equipmentMatch: false,
        driveHoursRemaining: 0,
        distanceMiles: 1000,
        isAvailable: false,
        activeLoadCount: 10,
      });
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  // ── getRecommendations ────────────────────────────────────────────────────

  describe('getRecommendations', () => {
    it('should throw NotFoundException when load not found', async () => {
      mockPrisma.load.findFirst.mockResolvedValue(null);

      await expect(service.getRecommendations('LD-999', 1)).rejects.toThrow('Load LD-999 not found');
    });

    it('should return empty array when no drivers', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({
        loadNumber: 'LD-001',
        equipmentType: 'dry_van',
        stops: [],
      });
      mockPrisma.driver.findMany.mockResolvedValue([]);

      const result = await service.getRecommendations('LD-001', 1);
      expect(result).toEqual([]);
    });

    it('should score and rank drivers correctly', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({
        loadNumber: 'LD-001',
        equipmentType: 'dry_van',
        requiredEquipmentType: 'DRY_VAN',
        stops: [
          {
            stop: { lat: 32.78, lon: -96.8, city: 'Dallas', state: 'TX' },
          },
        ],
      });

      const drivers = [
        {
          driverId: 'DRV-001',
          name: 'John Doe',
          status: 'ACTIVE',
          currentHoursDriven: 3,
          cycleHoursUsed: 30,
          currentHoursSinceBreak: 2,
          lastRestartAt: null,
          homeTerminalCity: 'Dallas',
          homeTerminalState: 'TX',
          assignedVehicleId: 1,
          assignedVehicle: {
            id: 1,
            vehicleId: 'VEH-001',
            unitNumber: 'T-100',
            equipmentType: 'dry_van',
          },
          loads: [],
        },
        {
          driverId: 'DRV-002',
          name: 'Jane Smith',
          status: 'ACTIVE',
          currentHoursDriven: 10,
          cycleHoursUsed: 60,
          currentHoursSinceBreak: 7,
          lastRestartAt: null,
          homeTerminalCity: null,
          homeTerminalState: null,
          assignedVehicleId: null,
          assignedVehicle: null,
          loads: [{ loadId: 'LD-002', loadNumber: '1002', status: 'IN_TRANSIT' }],
        },
      ];
      mockPrisma.driver.findMany.mockResolvedValue(drivers);
      mockIntegrationData.getDriverHOS.mockResolvedValue(null);
      mockIntegrationData.getVehicleLocation.mockResolvedValue(null);

      const result = await service.getRecommendations('LD-001', 1);

      expect(result).toHaveLength(2);
      expect(result[0].isBestMatch).toBe(true);
      // DRV-001 should rank higher: equipment match, available, more HOS
      expect(result[0].driverId).toBe('DRV-001');
      expect(result[0].equipmentMatch).toBe(true);
      expect(result[1].equipmentMatch).toBe(false);
      expect(result[1].activeLoadCount).toBe(1);
    });

    it('should handle GPS and HOS data gracefully on failure', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({
        loadNumber: 'LD-001',
        equipmentType: 'flatbed',
        stops: [],
      });
      mockPrisma.driver.findMany.mockResolvedValue([
        {
          driverId: 'DRV-001',
          name: 'John Doe',
          status: 'ACTIVE',
          currentHoursDriven: 5,
          cycleHoursUsed: 40,
          currentHoursSinceBreak: 4,
          lastRestartAt: new Date(Date.now() - 20 * 3600000),
          homeTerminalCity: 'Houston',
          homeTerminalState: 'TX',
          assignedVehicleId: 1,
          assignedVehicle: {
            id: 1,
            vehicleId: 'VEH-001',
            unitNumber: 'T-200',
            equipmentType: 'flatbed',
          },
          loads: [],
        },
      ]);
      mockIntegrationData.getDriverHOS.mockRejectedValue(new Error('HOS unavailable'));
      mockIntegrationData.getVehicleLocation.mockRejectedValue(new Error('GPS unavailable'));

      const result = await service.getRecommendations('LD-001', 1);

      expect(result).toHaveLength(1);
      // Falls back to DB fields for HOS
      expect(result[0].hos.driveHoursRemaining).toBe(6);
      // Falls back to home terminal for location
      expect(result[0].proximity.lastKnownLocation).toBe('Houston, TX');
    });

    it('should generate correct initials', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({
        loadNumber: 'LD-001',
        equipmentType: null,
        stops: [],
      });
      mockPrisma.driver.findMany.mockResolvedValue([
        {
          driverId: 'DRV-001',
          name: 'A',
          status: 'ACTIVE',
          currentHoursDriven: 0,
          cycleHoursUsed: 0,
          currentHoursSinceBreak: 0,
          lastRestartAt: null,
          homeTerminalCity: null,
          homeTerminalState: null,
          assignedVehicleId: null,
          assignedVehicle: null,
          loads: [],
        },
      ]);
      mockIntegrationData.getDriverHOS.mockResolvedValue(null);

      const result = await service.getRecommendations('LD-001', 1);
      // Single-word name shorter than 2 chars: 'A'.slice(0,2) = 'A'
      expect(result[0].initials).toBe('A');
    });
  });

  // ── unavailability filtering ───────────────────────────────────────────────

  describe('getRecommendations - unavailability filtering', () => {
    const baseDriver = {
      status: 'ACTIVE',
      currentHoursDriven: 3,
      cycleHoursUsed: 30,
      currentHoursSinceBreak: 2,
      lastRestartAt: null,
      homeTerminalCity: 'Dallas',
      homeTerminalState: 'TX',
      assignedVehicleId: null,
      assignedVehicle: null,
      loads: [],
    };

    it('should exclude unavailable drivers from recommendations', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({
        loadNumber: 'LD-001',
        equipmentType: 'dry_van',
        pickupDate: new Date('2026-03-01'),
        deliveryDate: new Date('2026-03-03'),
        stops: [],
      });
      mockPrisma.driver.findMany.mockResolvedValue([
        { ...baseDriver, id: 1, driverId: 'DRV-001', name: 'Available Driver' },
        {
          ...baseDriver,
          id: 2,
          driverId: 'DRV-002',
          name: 'Unavailable Driver',
        },
      ]);
      mockPrisma.driverUnavailability.findMany.mockResolvedValue([{ driverId: 2 }]);
      mockIntegrationData.getDriverHOS.mockResolvedValue(null);
      mockIntegrationData.getVehicleLocation.mockResolvedValue(null);

      const result = await service.getRecommendations('LD-001', 1);

      expect(result).toHaveLength(1);
      expect(result[0].driverId).toBe('DRV-001');
    });

    it('should include all drivers when no unavailabilities exist', async () => {
      mockPrisma.load.findFirst.mockResolvedValue({
        loadNumber: 'LD-001',
        equipmentType: 'dry_van',
        pickupDate: new Date('2026-03-01'),
        deliveryDate: new Date('2026-03-03'),
        stops: [],
      });
      mockPrisma.driver.findMany.mockResolvedValue([
        { ...baseDriver, id: 1, driverId: 'DRV-001', name: 'Driver One' },
        { ...baseDriver, id: 2, driverId: 'DRV-002', name: 'Driver Two' },
      ]);
      mockPrisma.driverUnavailability.findMany.mockResolvedValue([]);
      mockIntegrationData.getDriverHOS.mockResolvedValue(null);
      mockIntegrationData.getVehicleLocation.mockResolvedValue(null);

      const result = await service.getRecommendations('LD-001', 1);

      expect(result).toHaveLength(2);
      const driverIds = result.map((r) => r.driverId);
      expect(driverIds).toContain('DRV-001');
      expect(driverIds).toContain('DRV-002');
    });
  });

  // ── generateRationale ─────────────────────────────────────────────────────

  describe('generateRationale', () => {
    it('returns equipment mismatch message when equipment does not match', () => {
      const input: RationaleInput = {
        equipmentMatch: false,
        driveHoursRemaining: 11,
        distanceMiles: 50,
        isClosest: true,
      };
      expect(service.generateRationale(input)).toBe('Equipment mismatch · Closest · full HOS');
    });

    it('returns closest + full HOS message for closest driver with full HOS', () => {
      const input: RationaleInput = {
        equipmentMatch: true,
        driveHoursRemaining: 11,
        distanceMiles: 50,
        isClosest: true,
      };
      expect(service.generateRationale(input)).toBe('Closest · full HOS');
    });

    it('returns closest + needs reset message for closest driver with no HOS', () => {
      const input: RationaleInput = {
        equipmentMatch: true,
        driveHoursRemaining: 0,
        distanceMiles: 50,
        isClosest: true,
      };
      expect(service.generateRationale(input)).toBe('Closest · needs reset');
    });

    it('returns full HOS available message when not closest but has full HOS', () => {
      const input: RationaleInput = {
        equipmentMatch: true,
        driveHoursRemaining: 11,
        distanceMiles: 300,
        isClosest: false,
      };
      expect(service.generateRationale(input)).toBe('Full HOS available');
    });

    it('returns needs reset message when not closest and no HOS', () => {
      const input: RationaleInput = {
        equipmentMatch: true,
        driveHoursRemaining: 0,
        distanceMiles: 300,
        isClosest: false,
      };
      expect(service.generateRationale(input)).toBe('Needs HOS reset');
    });

    it('returns hours remaining as fallback for partial HOS', () => {
      const input: RationaleInput = {
        equipmentMatch: true,
        driveHoursRemaining: 6.5,
        distanceMiles: 300,
        isClosest: false,
      };
      const rationale = service.generateRationale(input);
      expect(rationale).toContain('6.5h');
      expect(rationale).toContain('drive remaining');
    });

    it('returns no vehicle message when hasVehicle is false', () => {
      const rationale = service.generateRationale({
        equipmentMatch: false,
        driveHoursRemaining: 11,
        distanceMiles: 50,
        isClosest: true,
        hasVehicle: false,
      });
      expect(rationale).toContain('No vehicle assigned');
    });

    it('returns closest + partial HOS for closest driver with partial HOS', () => {
      const rationale = service.generateRationale({
        equipmentMatch: true,
        driveHoursRemaining: 5,
        distanceMiles: 50,
        isClosest: true,
      });
      expect(rationale).toContain('Closest');
      expect(rationale).toContain('5.0h');
    });
  });
});

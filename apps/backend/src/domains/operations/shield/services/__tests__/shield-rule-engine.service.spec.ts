import { Test, TestingModule } from '@nestjs/testing';
import { ShieldRuleEngine } from '../shield-rule-engine.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { computeCategoryScore, computeOverallScore } from '../../shield.types';

describe('ShieldRuleEngine', () => {
  let engine: ShieldRuleEngine;

  const mockPrisma = {
    driver: { findMany: jest.fn() },
    vehicle: { findMany: jest.fn() },
    load: { findMany: jest.fn() },
    iftaQuarter: { findMany: jest.fn().mockResolvedValue([]) },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ShieldRuleEngine, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    engine = module.get<ShieldRuleEngine>(ShieldRuleEngine);
    jest.clearAllMocks();
  });

  // Helper to build a compliant driver mock with all v2 fields
  function makeDriver(overrides: Record<string, unknown> = {}) {
    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 90);
    return {
      driverId: 'drv-1',
      name: 'Test Driver',
      medicalCardExpiry: farFuture,
      cdlClass: 'A',
      cdlExpiry: farFuture,
      endorsements: [],
      hireDate: new Date('2020-01-01'),
      mvrDate: new Date(), // recent
      drugTestDate: new Date(), // recent
      annualReviewDate: new Date(), // recent
      _count: { loads: 0 },
      ...overrides,
    };
  }

  // Helper to build a compliant vehicle mock with all v2 fields
  function makeVehicle(overrides: Record<string, unknown> = {}) {
    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 90);
    return {
      vehicleId: 'veh-1',
      unitNumber: 'UNIT-001',
      equipmentType: 'DRY_VAN',
      vin: '1HGCM82633A004352',
      status: 'AVAILABLE',
      registrationExpiry: farFuture,
      insuranceExpiry: farFuture,
      annualInspectionDate: new Date(), // recent
      nextMaintenanceDate: farFuture,
      dvirs: [],
      ...overrides,
    };
  }

  describe('checkDrivers', () => {
    it('should flag CRITICAL when medical card expired', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);
      mockPrisma.driver.findMany.mockResolvedValue([
        makeDriver({
          driverId: 'drv-1',
          name: 'Martinez, R.',
          medicalCardExpiry: pastDate,
        }),
      ]);

      const result = await engine.checkDrivers(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'CRITICAL',
            entityId: 'drv-1',
            title: expect.stringContaining('Medical card expired'),
            regulation: '49 CFR 391.41',
          }),
        ]),
      );
    });

    it('should flag WARNING when medical card expires within 30 days', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 20);
      mockPrisma.driver.findMany.mockResolvedValue([
        makeDriver({
          driverId: 'drv-2',
          name: 'Patel, K.',
          medicalCardExpiry: futureDate,
        }),
      ]);

      const result = await engine.checkDrivers(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'WARNING',
            entityId: 'drv-2',
          }),
        ]),
      );
    });

    it('should flag CRITICAL when medical card expires within 14 days', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      mockPrisma.driver.findMany.mockResolvedValue([
        makeDriver({
          driverId: 'drv-3',
          name: 'Lee, J.',
          medicalCardExpiry: futureDate,
        }),
      ]);

      const result = await engine.checkDrivers(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'CRITICAL',
            entityId: 'drv-3',
          }),
        ]),
      );
    });

    it('should return no warnings/criticals when all drivers compliant', async () => {
      mockPrisma.driver.findMany.mockResolvedValue([makeDriver({ driverId: 'drv-4', name: 'Chen, L.' })]);

      const result = await engine.checkDrivers(1);

      const criticals = result.findings.filter((f) => f.severity === 'CRITICAL');
      const warnings = result.findings.filter((f) => f.severity === 'WARNING');
      expect(criticals).toHaveLength(0);
      expect(warnings).toHaveLength(0);
      expect(result.score).toEqual(100);
    });

    it('should flag CRITICAL when no medical card on file and driver has active loads', async () => {
      mockPrisma.driver.findMany.mockResolvedValue([
        makeDriver({
          driverId: 'drv-5',
          name: 'Smith, A.',
          medicalCardExpiry: null,
          _count: { loads: 2 },
        }),
      ]);

      const result = await engine.checkDrivers(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'CRITICAL',
            title: expect.stringContaining('No medical card'),
            description: expect.stringContaining('2 active loads'),
          }),
        ]),
      );
    });

    it('should flag WARNING when no medical card on file and driver has no active loads', async () => {
      mockPrisma.driver.findMany.mockResolvedValue([
        makeDriver({
          driverId: 'drv-5b',
          name: 'Doe, J.',
          medicalCardExpiry: null,
          _count: { loads: 0 },
        }),
      ]);

      const result = await engine.checkDrivers(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'WARNING',
            title: expect.stringContaining('No medical card'),
          }),
        ]),
      );
    });

    it('should flag WARNING when CDL class not recorded', async () => {
      mockPrisma.driver.findMany.mockResolvedValue([
        makeDriver({ driverId: 'drv-6', name: 'Jones, B.', cdlClass: null }),
      ]);

      const result = await engine.checkDrivers(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'WARNING',
            title: expect.stringContaining('CDL class'),
            regulation: '49 CFR 383.91',
          }),
        ]),
      );
    });

    it('should include coverage manifest in result', async () => {
      mockPrisma.driver.findMany.mockResolvedValue([]);

      const result = await engine.checkDrivers(1);

      expect(result.coverage).toBeDefined();
      expect(result.coverage.length).toBeGreaterThan(0);
      expect(result.coverage).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            check: 'Medical certificate valid',
            source: 'rule',
          }),
          expect.objectContaining({
            check: 'CDL valid & not expired',
            source: 'rule',
          }),
          expect.objectContaining({
            check: 'DQ file completeness patterns',
            source: 'ai',
          }),
        ]),
      );
    });
  });

  describe('checkDrivers — v2 compliance fields', () => {
    it('should flag CRITICAL when CDL is expired and driver has active loads', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);
      mockPrisma.driver.findMany.mockResolvedValue([
        makeDriver({
          driverId: 'drv-cdl-1',
          name: 'Expired CDL Driver',
          cdlExpiry: pastDate,
          _count: { loads: 1 },
        }),
      ]);

      const result = await engine.checkDrivers(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'CRITICAL',
            title: expect.stringContaining('CDL expired'),
            regulation: '49 CFR 391.11',
          }),
        ]),
      );
    });

    it('should flag WARNING when CDL expires within 30 days', async () => {
      const soonDate = new Date();
      soonDate.setDate(soonDate.getDate() + 20);
      mockPrisma.driver.findMany.mockResolvedValue([
        makeDriver({
          driverId: 'drv-cdl-2',
          name: 'Soon CDL Driver',
          cdlExpiry: soonDate,
        }),
      ]);

      const result = await engine.checkDrivers(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'WARNING',
            title: expect.stringContaining('CDL expires in'),
            regulation: '49 CFR 391.11',
          }),
        ]),
      );
    });

    it('should flag CRITICAL when CDL expires within 14 days', async () => {
      const soonDate = new Date();
      soonDate.setDate(soonDate.getDate() + 7);
      mockPrisma.driver.findMany.mockResolvedValue([
        makeDriver({
          driverId: 'drv-cdl-3',
          name: 'Urgent CDL Driver',
          cdlExpiry: soonDate,
        }),
      ]);

      const result = await engine.checkDrivers(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'CRITICAL',
            title: expect.stringContaining('CDL expires in'),
            regulation: '49 CFR 391.11',
          }),
        ]),
      );
    });

    it('should flag WARNING when MVR is older than 12 months', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 400);
      mockPrisma.driver.findMany.mockResolvedValue([
        makeDriver({
          driverId: 'drv-mvr-1',
          name: 'Old MVR Driver',
          mvrDate: oldDate,
        }),
      ]);

      const result = await engine.checkDrivers(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'WARNING',
            title: expect.stringContaining('MVR overdue'),
            regulation: '49 CFR 391.25',
          }),
        ]),
      );
    });

    it('should not flag MVR when it is recent', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 100);
      mockPrisma.driver.findMany.mockResolvedValue([
        makeDriver({
          driverId: 'drv-mvr-2',
          name: 'Recent MVR Driver',
          mvrDate: recentDate,
        }),
      ]);

      const result = await engine.checkDrivers(1);

      const mvrFindings = result.findings.filter((f) => f.title.includes('MVR'));
      expect(mvrFindings).toHaveLength(0);
    });

    it('should flag WARNING when drug test is older than 24 months', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 800);
      mockPrisma.driver.findMany.mockResolvedValue([
        makeDriver({
          driverId: 'drv-drug-1',
          name: 'Old Drug Test Driver',
          drugTestDate: oldDate,
        }),
      ]);

      const result = await engine.checkDrivers(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'WARNING',
            title: expect.stringContaining('Drug test overdue'),
            regulation: '49 CFR Part 382',
          }),
        ]),
      );
    });

    it('should flag WARNING when annual review is older than 12 months', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 400);
      mockPrisma.driver.findMany.mockResolvedValue([
        makeDriver({
          driverId: 'drv-review-1',
          name: 'Old Review Driver',
          annualReviewDate: oldDate,
        }),
      ]);

      const result = await engine.checkDrivers(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'WARNING',
            title: expect.stringContaining('Annual review overdue'),
            regulation: '49 CFR 391.51',
          }),
        ]),
      );
    });
  });

  describe('checkHOS', () => {
    it('should flag CRITICAL when drive hours exceed 10', async () => {
      mockPrisma.driver.findMany.mockResolvedValue([
        {
          driverId: 'drv-1',
          name: 'Martinez, R.',
          currentHoursDriven: 10.5,
          currentOnDutyTime: 12,
          currentHoursSinceBreak: 5,
          cycleHoursUsed: 50,
          hosDataSyncedAt: new Date(),
        },
      ]);

      const result = await engine.checkHOS(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'CRITICAL',
            title: expect.stringContaining('Drive hours critical'),
            regulation: '49 CFR 395.3(a)',
          }),
        ]),
      );
    });

    it('should flag WARNING when drive hours exceed 9', async () => {
      mockPrisma.driver.findMany.mockResolvedValue([
        {
          driverId: 'drv-2',
          name: 'Patel, K.',
          currentHoursDriven: 9.5,
          currentOnDutyTime: 10,
          currentHoursSinceBreak: 5,
          cycleHoursUsed: 50,
          hosDataSyncedAt: new Date(),
        },
      ]);

      const result = await engine.checkHOS(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'WARNING',
            title: expect.stringContaining('Drive hours approaching'),
            regulation: '49 CFR 395.3(a)',
          }),
        ]),
      );
    });

    it('should flag CRITICAL when break required (8h+)', async () => {
      mockPrisma.driver.findMany.mockResolvedValue([
        {
          driverId: 'drv-3',
          name: 'Lee, J.',
          currentHoursDriven: 5,
          currentOnDutyTime: 8,
          currentHoursSinceBreak: 8.5,
          cycleHoursUsed: 50,
          hosDataSyncedAt: new Date(),
        },
      ]);

      const result = await engine.checkHOS(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'CRITICAL',
            title: expect.stringContaining('Break required'),
            regulation: '49 CFR 395.3(a)(3)',
          }),
        ]),
      );
    });

    it('should include coverage manifest in result', async () => {
      mockPrisma.driver.findMany.mockResolvedValue([]);

      const result = await engine.checkHOS(1);

      expect(result.coverage).toBeDefined();
      expect(result.coverage).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            check: '11-hour drive limit',
            source: 'rule',
          }),
          expect.objectContaining({
            check: 'Fatigue pattern detection',
            source: 'ai',
          }),
        ]),
      );
    });
  });

  describe('checkLoads', () => {
    it('should flag WARNING for in-transit loads without weight', async () => {
      mockPrisma.load.findMany.mockResolvedValue([
        {
          referenceNumber: 'REF-001',
          loadNumber: 'LN-001',
          status: 'IN_TRANSIT',
          weightLbs: 0,
          commodityType: 'General Freight',
          stops: [],
        },
      ]);

      const result = await engine.checkLoads(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'WARNING',
            title: expect.stringContaining('Missing weight'),
          }),
        ]),
      );
    });

    it('should flag CRITICAL for hazmat load without placard', async () => {
      mockPrisma.load.findMany.mockResolvedValue([
        {
          referenceNumber: 'REF-HAZ-001',
          loadNumber: 'LN-HAZ-001',
          status: 'IN_TRANSIT',
          weightLbs: 40000,
          commodityType: 'Chemicals',
          hazmatClass: '3',
          unNumber: 'UN1203',
          placardRequired: false,
          stops: [],
        },
      ]);

      const result = await engine.checkLoads(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'CRITICAL',
            title: expect.stringContaining('Hazmat without placard'),
            regulation: '49 CFR § 172.504',
          }),
        ]),
      );
    });

    it('should flag WARNING for hazmat load without UN number', async () => {
      mockPrisma.load.findMany.mockResolvedValue([
        {
          referenceNumber: 'REF-HAZ-002',
          loadNumber: 'LN-HAZ-002',
          status: 'IN_TRANSIT',
          weightLbs: 40000,
          commodityType: 'Chemicals',
          hazmatClass: '3',
          unNumber: null,
          placardRequired: true,
          stops: [],
        },
      ]);

      const result = await engine.checkLoads(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'WARNING',
            title: expect.stringContaining('Hazmat missing UN number'),
            regulation: '49 CFR § 172.301',
          }),
        ]),
      );
    });

    it('should flag CRITICAL for overweight load', async () => {
      mockPrisma.load.findMany.mockResolvedValue([
        {
          referenceNumber: 'REF-OW-001',
          loadNumber: 'LN-OW-001',
          status: 'IN_TRANSIT',
          weightLbs: 85000,
          commodityType: 'Steel',
          hazmatClass: null,
          unNumber: null,
          placardRequired: false,
          stops: [],
        },
      ]);

      const result = await engine.checkLoads(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'CRITICAL',
            title: expect.stringContaining('Overweight'),
            regulation: '23 CFR § 658.17',
          }),
        ]),
      );
    });

    it('should include coverage manifest in result', async () => {
      mockPrisma.load.findMany.mockResolvedValue([]);

      const result = await engine.checkLoads(1);

      expect(result.coverage).toBeDefined();
      expect(result.coverage).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            check: 'Weight compliance (80k lbs)',
            source: 'rule',
          }),
          expect.objectContaining({
            check: 'Cargo ↔ equipment validation',
            source: 'ai',
          }),
        ]),
      );
    });
  });

  describe('checkVehicles', () => {
    it('should return INFO when no active vehicles', async () => {
      mockPrisma.vehicle.findMany.mockResolvedValue([]);

      const result = await engine.checkVehicles(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'INFO',
            title: 'No active vehicles',
          }),
        ]),
      );
    });

    it('should include coverage manifest in result', async () => {
      mockPrisma.vehicle.findMany.mockResolvedValue([]);

      const result = await engine.checkVehicles(1);

      expect(result.coverage).toBeDefined();
      expect(result.coverage).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            check: 'Registration current',
            source: 'rule',
          }),
          expect.objectContaining({
            check: 'DVIR pre/post-trip',
            source: 'rule',
          }),
        ]),
      );
    });
  });

  describe('checkVehicles — v2 compliance', () => {
    it('should flag CRITICAL when registration is expired', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);
      mockPrisma.vehicle.findMany.mockResolvedValue([makeVehicle({ registrationExpiry: pastDate })]);

      const result = await engine.checkVehicles(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'CRITICAL',
            title: expect.stringContaining('Registration expired'),
            regulation: '49 CFR 390.21',
          }),
        ]),
      );
    });

    it('should flag WARNING when registration expires within 30 days', async () => {
      const soonDate = new Date();
      soonDate.setDate(soonDate.getDate() + 15);
      mockPrisma.vehicle.findMany.mockResolvedValue([makeVehicle({ registrationExpiry: soonDate })]);

      const result = await engine.checkVehicles(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'WARNING',
            title: expect.stringContaining('Registration expires in'),
            regulation: '49 CFR 390.21',
          }),
        ]),
      );
    });

    it('should flag CRITICAL when insurance is expired', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);
      mockPrisma.vehicle.findMany.mockResolvedValue([makeVehicle({ insuranceExpiry: pastDate })]);

      const result = await engine.checkVehicles(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'CRITICAL',
            title: expect.stringContaining('Insurance expired'),
            regulation: '49 CFR Part 387',
          }),
        ]),
      );
    });

    it('should flag WARNING when insurance expires within 30 days', async () => {
      const soonDate = new Date();
      soonDate.setDate(soonDate.getDate() + 20);
      mockPrisma.vehicle.findMany.mockResolvedValue([makeVehicle({ insuranceExpiry: soonDate })]);

      const result = await engine.checkVehicles(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'WARNING',
            title: expect.stringContaining('Insurance expires in'),
            regulation: '49 CFR Part 387',
          }),
        ]),
      );
    });

    it('should flag WARNING when annual inspection is older than 11 months', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 340);
      mockPrisma.vehicle.findMany.mockResolvedValue([makeVehicle({ annualInspectionDate: oldDate })]);

      const result = await engine.checkVehicles(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'WARNING',
            title: expect.stringContaining('Annual inspection due soon'),
            regulation: '49 CFR 396.17',
          }),
        ]),
      );
    });

    it('should flag CRITICAL when annual inspection is older than 14 months', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 450);
      mockPrisma.vehicle.findMany.mockResolvedValue([makeVehicle({ annualInspectionDate: oldDate })]);

      const result = await engine.checkVehicles(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'CRITICAL',
            title: expect.stringContaining('Annual inspection overdue'),
            regulation: '49 CFR 396.17',
          }),
        ]),
      );
    });

    it('should flag WARNING when maintenance is overdue', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 15);
      mockPrisma.vehicle.findMany.mockResolvedValue([makeVehicle({ nextMaintenanceDate: pastDate })]);

      const result = await engine.checkVehicles(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'WARNING',
            title: expect.stringContaining('Maintenance overdue'),
            regulation: '49 CFR 396.3',
          }),
        ]),
      );
    });

    it('should flag WARNING when assigned vehicle has no DVIR in last 24h', async () => {
      const oldDvirDate = new Date();
      oldDvirDate.setHours(oldDvirDate.getHours() - 30);
      mockPrisma.vehicle.findMany.mockResolvedValue([
        makeVehicle({
          status: 'ASSIGNED',
          dvirs: [
            {
              inspectedAt: oldDvirDate,
              condition: 'satisfactory',
              defectsCount: 0,
              mechanicSignedOff: false,
            },
          ],
        }),
      ]);

      const result = await engine.checkVehicles(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'WARNING',
            title: expect.stringContaining('No DVIR in 24 hours'),
            regulation: '49 CFR 396.11',
          }),
        ]),
      );
    });

    it('should flag CRITICAL when vehicle has unresolved DVIR defects', async () => {
      mockPrisma.vehicle.findMany.mockResolvedValue([
        makeVehicle({
          status: 'ASSIGNED',
          dvirs: [
            {
              inspectedAt: new Date(),
              condition: 'needs_repair',
              defectsCount: 2,
              mechanicSignedOff: false,
            },
          ],
        }),
      ]);

      const result = await engine.checkVehicles(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'CRITICAL',
            title: expect.stringContaining('Unresolved DVIR defects'),
            regulation: '49 CFR 396.11',
          }),
        ]),
      );
    });

    it('should not flag DVIR defects when mechanic has signed off', async () => {
      mockPrisma.vehicle.findMany.mockResolvedValue([
        makeVehicle({
          status: 'ASSIGNED',
          dvirs: [
            {
              inspectedAt: new Date(),
              condition: 'needs_repair',
              defectsCount: 2,
              mechanicSignedOff: true,
            },
          ],
        }),
      ]);

      const result = await engine.checkVehicles(1);

      const dvirFindings = result.findings.filter((f) => f.title.includes('Unresolved DVIR'));
      expect(dvirFindings).toHaveLength(0);
    });

    it('should flag WARNING when ASSIGNED vehicle has null registrationExpiry', async () => {
      mockPrisma.vehicle.findMany.mockResolvedValue([
        makeVehicle({
          status: 'ASSIGNED',
          registrationExpiry: null,
        }),
      ]);

      const result = await engine.checkVehicles(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'WARNING',
            title: expect.stringContaining('No registration on file'),
            regulation: '49 CFR 390.21',
          }),
        ]),
      );
    });

    it('should flag WARNING when ASSIGNED vehicle has null insuranceExpiry', async () => {
      mockPrisma.vehicle.findMany.mockResolvedValue([
        makeVehicle({
          status: 'ASSIGNED',
          insuranceExpiry: null,
        }),
      ]);

      const result = await engine.checkVehicles(1);

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'WARNING',
            title: expect.stringContaining('No insurance on file'),
            regulation: '49 CFR Part 387',
          }),
        ]),
      );
    });

    it('should NOT flag null registrationExpiry on AVAILABLE vehicles', async () => {
      mockPrisma.vehicle.findMany.mockResolvedValue([
        makeVehicle({
          status: 'AVAILABLE',
          registrationExpiry: null,
        }),
      ]);

      const result = await engine.checkVehicles(1);

      const regFindings = result.findings.filter((f) => f.title.includes('registration'));
      expect(regFindings).toHaveLength(0);
    });

    it('should not flag DVIR for non-ASSIGNED vehicles', async () => {
      const oldDvirDate = new Date();
      oldDvirDate.setHours(oldDvirDate.getHours() - 30);
      mockPrisma.vehicle.findMany.mockResolvedValue([
        makeVehicle({
          status: 'AVAILABLE',
          dvirs: [
            {
              inspectedAt: oldDvirDate,
              condition: 'needs_repair',
              defectsCount: 1,
              mechanicSignedOff: false,
            },
          ],
        }),
      ]);

      const result = await engine.checkVehicles(1);

      const dvirFindings = result.findings.filter(
        (f) => f.title.includes('DVIR') || f.title.includes('Unresolved DVIR'),
      );
      expect(dvirFindings).toHaveLength(0);
    });
  });

  describe('checkCrossEntity', () => {
    it('should flag CRITICAL when hazmat load assigned to driver without H endorsement', async () => {
      mockPrisma.load.findMany.mockResolvedValue([
        {
          referenceNumber: 'REF-HAZ-001',
          loadNumber: 'LN-HAZ-001',
          hazmatClass: '3',
          driver: {
            driverId: 'drv-no-h',
            name: 'No Hazmat Driver',
            endorsements: ['T', 'N'],
          },
        },
      ]);

      const result = await engine.checkCrossEntity(1);

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'CRITICAL',
            title: expect.stringContaining('Hazmat load without H endorsement'),
            regulation: '49 CFR 383.93',
          }),
        ]),
      );
    });

    it('should not flag when hazmat driver has H endorsement', async () => {
      mockPrisma.load.findMany.mockResolvedValue([
        {
          referenceNumber: 'REF-HAZ-002',
          loadNumber: 'LN-HAZ-002',
          hazmatClass: '3',
          driver: {
            driverId: 'drv-has-h',
            name: 'Hazmat Driver',
            endorsements: ['H', 'T'],
          },
        },
      ]);

      const result = await engine.checkCrossEntity(1);

      expect(result).toHaveLength(0);
    });

    it('should not flag when hazmat load has no driver assigned', async () => {
      mockPrisma.load.findMany.mockResolvedValue([
        {
          referenceNumber: 'REF-HAZ-003',
          loadNumber: 'LN-HAZ-003',
          hazmatClass: '3',
          driver: null,
        },
      ]);

      const result = await engine.checkCrossEntity(1);

      expect(result).toHaveLength(0);
    });

    it('should flag multiple loads without H endorsement', async () => {
      mockPrisma.load.findMany.mockResolvedValue([
        {
          referenceNumber: 'REF-HAZ-004A',
          loadNumber: 'LN-HAZ-004A',
          hazmatClass: '3',
          driver: {
            driverId: 'drv-no-h-2',
            name: 'Driver A',
            endorsements: [],
          },
        },
        {
          referenceNumber: 'REF-HAZ-004B',
          loadNumber: 'LN-HAZ-004B',
          hazmatClass: '8',
          driver: {
            driverId: 'drv-no-h-3',
            name: 'Driver B',
            endorsements: ['T'],
          },
        },
      ]);

      const result = await engine.checkCrossEntity(1);

      expect(result).toHaveLength(2);
    });
  });
});

describe('Score Computation', () => {
  it('should deduct 15 for CRITICAL and 5 for WARNING', () => {
    const score = computeCategoryScore([
      {
        severity: 'CRITICAL',
        title: '',
        description: '',
        category: 'DRIVERS',
      },
      {
        severity: 'WARNING',
        title: '',
        description: '',
        category: 'DRIVERS',
      },
    ]);
    expect(score).toBe(80);
  });

  it('should floor at 0', () => {
    const findings = Array(10).fill({
      severity: 'CRITICAL',
      title: '',
      description: '',
      category: 'DRIVERS',
    });
    expect(computeCategoryScore(findings)).toBe(0);
  });

  it('should compute weighted overall score', () => {
    const score = computeOverallScore({
      HOS: 100,
      DRIVERS: 100,
      VEHICLES: 100,
      LOADS: 100,
    });
    expect(score).toBe(100);
  });

  it('should handle partial category scores', () => {
    const score = computeOverallScore({
      HOS: 80,
      DRIVERS: 60,
    });
    // HOS=80*0.30=24, DRIVERS=60*0.30=18, total weight=0.60
    // (24+18)/0.60 = 70
    expect(score).toBe(70);
  });
});

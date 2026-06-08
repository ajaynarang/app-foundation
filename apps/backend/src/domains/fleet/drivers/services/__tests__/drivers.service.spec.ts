import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DriversService } from '../drivers.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../../infrastructure/events/domain-event.service';
import { CustomFieldValidatorService } from '../../../custom-fields/custom-field-validator.service';
import { createMockPrisma } from '../../../../../test/mocks';
import { makeDriver } from '../../../../../test/factories';

describe('DriversService', () => {
  let service: DriversService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriversService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: DomainEventService,
          useValue: { emit: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: CustomFieldValidatorService,
          useValue: {
            validate: jest.fn().mockResolvedValue({ values: {}, warnings: [] }),
            getDefinitions: jest.fn().mockResolvedValue([]),
            invalidateCache: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn(), emitAsync: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<DriversService>(DriversService);
  });

  // ─── findAll ─────────────────────────────────────────────

  describe('findAll', () => {
    it('should return drivers for a tenant excluding inactive by default', async () => {
      const drivers = [makeDriver(), makeDriver({ id: 2, driverId: 'drv-002' })];
      prisma.driver.findMany.mockResolvedValue(drivers);

      const result = await service.findAll(1);

      expect(prisma.driver.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 1,
            status: { in: ['PENDING_ACTIVATION', 'ACTIVE'] },
          },
        }),
      );
      expect(result).toHaveLength(2);
    });

    it('should include inactive drivers when flag is true', async () => {
      prisma.driver.findMany.mockResolvedValue([]);

      await service.findAll(1, true);

      expect(prisma.driver.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 1 },
        }),
      );
      // No status filter when includeInactive is true
      const callArgs = prisma.driver.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toBeUndefined();
    });

    it('should order by driverId ascending', async () => {
      prisma.driver.findMany.mockResolvedValue([]);

      await service.findAll(1);

      expect(prisma.driver.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { driverId: 'asc' },
        }),
      );
    });
  });

  // ─── findOne ─────────────────────────────────────────────

  describe('findOne', () => {
    it('should return driver with relations when found', async () => {
      const driver = makeDriver({ user: { userId: 'u-1', isActive: true } });
      prisma.driver.findUnique.mockResolvedValue(driver);

      const result = await service.findOne('drv-test-001', 1);

      expect(prisma.driver.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            driverId_tenantId: { driverId: 'drv-test-001', tenantId: 1 },
          },
        }),
      );
      expect(result.driverId).toBe('drv-test-001');
    });

    it('should throw NotFoundException when driver not found', async () => {
      prisma.driver.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ──────────────────────────────────────────────

  describe('create', () => {
    it('should create a driver with correct fields and ACTIVE status', async () => {
      const created = makeDriver();
      prisma.driver.create.mockResolvedValue(created);

      const result = await service.create(1, {
        name: 'John Driver',
        cdlClass: 'A',
        licenseNumber: 'DL-123456789',
        phone: '555-000-0100',
        email: 'john@test.com',
      });

      // $transaction is called; the create happens inside it
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should sync vehicle assignedDriverId when assignedVehicleId is provided', async () => {
      const created = makeDriver({ id: 5, assignedVehicleId: 10 });
      prisma.driver.create.mockResolvedValue(created);
      prisma.vehicle.update.mockResolvedValue({});

      await service.create(1, {
        name: 'John Driver',
        cdlClass: 'A',
        licenseNumber: 'DL-123',
        assignedVehicleId: 10,
      });

      expect(prisma.vehicle.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { assignedDriverId: 5 },
      });
    });

    it('should throw ConflictException on duplicate driverId (P2002)', async () => {
      const prismaError = new Error('Unique constraint');
      (prismaError as any).code = 'P2002';
      prisma.$transaction.mockRejectedValue(prismaError);

      await expect(
        service.create(1, {
          name: 'Dup Driver',
          cdlClass: 'A',
          licenseNumber: 'DL-DUP',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── update ──────────────────────────────────────────────

  describe('update', () => {
    it('should update allowed fields on a driver', async () => {
      const existing = makeDriver({ id: 3, assignedVehicleId: null });
      prisma.driver.findUnique.mockResolvedValue(existing);
      const updated = makeDriver({ id: 3, name: 'Updated Name' });
      prisma.driver.update.mockResolvedValue(updated);

      const result = await service.update('drv-test-001', 1, {
        name: 'Updated Name',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.name).toBe('Updated Name');
    });

    it('should perform bidirectional vehicle sync when changing vehicle', async () => {
      const existing = makeDriver({ id: 3, assignedVehicleId: 5 });
      prisma.driver.findUnique.mockResolvedValue(existing);
      prisma.vehicle.update.mockResolvedValue({});
      prisma.driver.update.mockResolvedValue(makeDriver({ id: 3, assignedVehicleId: 10 }));

      await service.update('drv-test-001', 1, { assignedVehicleId: 10 });

      // Should clear old vehicle's assignedDriverId
      expect(prisma.vehicle.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { assignedDriverId: null },
      });
      // Should set new vehicle's assignedDriverId
      expect(prisma.vehicle.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { assignedDriverId: 3 },
      });
    });

    // SQ-105 — Samsara-synced drivers must accept operational edits
    // (assignedVehicleId, notes, homeTerminal, emergencyContact, hireDate,
    // medicalCardExpiry, endorsements) while identity fields managed by the
    // ELD (name, phone, email, cdlClass, license) are filtered out. Prior
    // behavior threw 403 from ExternalSourceGuard on ANY edit — that has
    // been replaced with this field-level split mirroring vehicles.service.
    describe('Samsara-synced driver (externalSource set)', () => {
      it('filters out identity fields but persists operational fields', async () => {
        const existing = makeDriver({ id: 4, assignedVehicleId: null, externalSource: 'samsara' });
        prisma.driver.findUnique.mockResolvedValue(existing);
        prisma.driver.update.mockResolvedValue(
          makeDriver({ id: 4, externalSource: 'samsara', notes: 'updated notes' }),
        );

        await service.update('drv-test-001', 1, {
          // Identity (should be stripped)
          name: 'Tried To Rename',
          phone: '555-0199',
          email: 'spoof@example.com',
          cdlClass: 'A',
          licenseNumber: 'NEW123',
          licenseState: 'CA',
          // Operational (should persist)
          notes: 'updated notes',
          homeTerminalCity: 'Chicago',
        });

        expect(prisma.driver.update).toHaveBeenCalled();
        const updateArgs = prisma.driver.update.mock.calls[0][0];
        const writtenData = updateArgs.data;
        // Identity fields must NOT be in the write payload
        expect(writtenData).not.toHaveProperty('name');
        expect(writtenData).not.toHaveProperty('phone');
        expect(writtenData).not.toHaveProperty('email');
        expect(writtenData).not.toHaveProperty('cdlClass');
        expect(writtenData).not.toHaveProperty('licenseNumber');
        expect(writtenData).not.toHaveProperty('licenseState');
        // Operational fields must be in the write payload
        expect(writtenData).toHaveProperty('notes', 'updated notes');
        expect(writtenData).toHaveProperty('homeTerminalCity', 'Chicago');
      });

      it('persists assignedVehicleId change on a Samsara-synced driver (the user-reported regression)', async () => {
        const existing = makeDriver({ id: 4, assignedVehicleId: null, externalSource: 'samsara' });
        prisma.driver.findUnique.mockResolvedValue(existing);
        prisma.vehicle.update.mockResolvedValue({});
        prisma.driver.update.mockResolvedValue(makeDriver({ id: 4, assignedVehicleId: 22 }));

        await service.update('drv-test-001', 1, { assignedVehicleId: 22 });

        // Bidirectional vehicle sync still fires
        expect(prisma.vehicle.update).toHaveBeenCalledWith({
          where: { id: 22 },
          data: { assignedDriverId: 4 },
        });
        // assignedVehicleId IS in the write payload — this is the bug we're fixing
        const writtenData = prisma.driver.update.mock.calls[0][0].data;
        expect(writtenData).toHaveProperty('assignedVehicleId', 22);
      });
    });

    describe('manual driver (externalSource null)', () => {
      it('writes all submitted fields including identity fields', async () => {
        const existing = makeDriver({ id: 5, assignedVehicleId: null, externalSource: null });
        prisma.driver.findUnique.mockResolvedValue(existing);
        prisma.driver.update.mockResolvedValue(makeDriver({ id: 5, name: 'Renamed' }));

        await service.update('drv-test-001', 1, {
          name: 'Renamed',
          phone: '555-0001',
          email: 'new@example.com',
          notes: 'manual edit',
        });

        const writtenData = prisma.driver.update.mock.calls[0][0].data;
        // Manual drivers: nothing filtered, all fields pass through
        expect(writtenData).toHaveProperty('name', 'Renamed');
        expect(writtenData).toHaveProperty('phone', '555-0001');
        expect(writtenData).toHaveProperty('email', 'new@example.com');
        expect(writtenData).toHaveProperty('notes', 'manual edit');
      });
    });
  });

  // ─── getWeeklyStats ──────────────────────────────────────

  describe('getWeeklyStats', () => {
    it('should throw NotFoundException if driver not found', async () => {
      prisma.driver.findUnique.mockResolvedValue(null);

      await expect(service.getWeeklyStats('drv-x', 1)).rejects.toThrow(NotFoundException);
    });

    it('should aggregate loads completed this week', async () => {
      prisma.driver.findUnique.mockResolvedValue({ id: 1 });
      prisma.load.findMany.mockResolvedValue([
        {
          actualMiles: 400,
          estimatedMiles: 380,
          settlementLineItems: [{ payAmountCents: 100000 }],
        },
        { actualMiles: null, estimatedMiles: 200, settlementLineItems: [] },
      ]);

      const result = await service.getWeeklyStats('drv-test-001', 1);

      expect(result.loadsCompleted).toBe(2);
      expect(result.milesDriven).toBe(600); // 400 + 200 (falls back to estimated)
      expect(result.earningsCents).toBe(100000);
    });
  });
});

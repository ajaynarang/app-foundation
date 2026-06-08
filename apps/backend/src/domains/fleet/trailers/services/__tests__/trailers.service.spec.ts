import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { TrailersService } from '../trailers.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../../infrastructure/events/domain-event.service';
import { createMockPrisma, createMockDomainEventService } from '../../../../../test/mocks';
import { makeTrailer } from '../../../../../test/factories';
import { SALLY_EVENTS } from '../../../../../infrastructure/events/sally-events.constants';

describe('TrailersService', () => {
  let service: TrailersService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let eventEmitter: ReturnType<typeof createMockDomainEventService>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    eventEmitter = createMockDomainEventService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrailersService,
        { provide: PrismaService, useValue: prisma },
        { provide: DomainEventService, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<TrailersService>(TrailersService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findAll ─────────────────────────────────────────────

  describe('findAll', () => {
    it('should return active trailers only by default', async () => {
      const trailer = makeTrailer();
      prisma.trailer.findMany.mockResolvedValue([trailer]);

      const result = await service.findAll(1);

      expect(prisma.trailer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 1, lifecycleStatus: 'ACTIVE' },
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('should include all lifecycle statuses when includeInactive is true', async () => {
      prisma.trailer.findMany.mockResolvedValue([]);

      await service.findAll(1, true);

      const callArgs = prisma.trailer.findMany.mock.calls[0][0];
      expect(callArgs.where).toEqual({ tenantId: 1 });
      expect(callArgs.where.lifecycleStatus).toBeUndefined();
    });

    it('should order by unitNumber ascending', async () => {
      prisma.trailer.findMany.mockResolvedValue([]);

      await service.findAll(1);

      expect(prisma.trailer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { unitNumber: 'asc' },
        }),
      );
    });
  });

  // ─── findInactive ────────────────────────────────────────

  describe('findInactive', () => {
    it('should return only INACTIVE and DECOMMISSIONED trailers', async () => {
      prisma.trailer.findMany.mockResolvedValue([]);

      await service.findInactive(1);

      expect(prisma.trailer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 1,
            lifecycleStatus: { in: ['INACTIVE', 'DECOMMISSIONED'] },
          },
        }),
      );
    });
  });

  // ─── findOne ─────────────────────────────────────────────

  describe('findOne', () => {
    it('should return trailer when found', async () => {
      const trailer = makeTrailer();
      prisma.trailer.findFirst.mockResolvedValue(trailer);

      const result = await service.findOne('TRL-TEST001', 1);

      expect(prisma.trailer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { trailerId: 'TRL-TEST001', tenantId: 1 },
        }),
      );
      expect(result.trailerId).toBe('TRL-TEST001');
    });

    it('should throw NotFoundException when not found', async () => {
      prisma.trailer.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ──────────────────────────────────────────────

  describe('create', () => {
    it('should create trailer with AVAILABLE status by default', async () => {
      const created = makeTrailer();
      prisma.trailer.create.mockResolvedValue(created);

      const result = await service.create(1, {
        unitNumber: 'TRL-5301',
        equipmentType: 'DRY_VAN',
      } as any);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.status).toBe('AVAILABLE');
    });

    it('should create trailer with ASSIGNED status when assignedVehicleId provided', async () => {
      const created = makeTrailer({
        assignedVehicleId: 5,
        status: 'ASSIGNED',
        assignedVehicle: { id: 5, vehicleId: 'VEH-1', unitNumber: 'T-101' },
      });
      prisma.trailer.create.mockResolvedValue(created);
      prisma.vehicle.findFirst.mockResolvedValue({ id: 5, tenantId: 1 });
      prisma.trailer.findFirst
        .mockResolvedValueOnce(null) // validateVehicleForAssignment - no existing assignment
        .mockResolvedValue(created); // any subsequent findFirst

      const result = await service.create(1, {
        unitNumber: 'TRL-5301',
        equipmentType: 'DRY_VAN',
        assignedVehicleId: 5,
      } as any);

      expect(result.status).toBe('ASSIGNED');
    });

    it('should generate trailerId starting with TRL-', async () => {
      const created = makeTrailer();
      prisma.trailer.create.mockResolvedValue(created);

      await service.create(1, {
        unitNumber: 'TRL-5301',
        equipmentType: 'DRY_VAN',
      } as any);

      // The transaction callback calls tx.trailer.create
      // Since $transaction passes prisma itself, check create call
      const createCall = prisma.trailer.create.mock.calls[0][0];
      expect(createCall.data.trailerId).toMatch(/^TRL-/);
    });

    it('should emit TRAILER_CREATED event', async () => {
      const created = makeTrailer();
      prisma.trailer.create.mockResolvedValue(created);

      await service.create(1, {
        unitNumber: 'TRL-5301',
        equipmentType: 'DRY_VAN',
      } as any);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.TRAILER_CREATED,
        expect.anything(), // tenantId
        expect.objectContaining({
          entityType: 'trailer',
        }),
      );
    });

    it('should reject reefer fields on non-REEFER type', async () => {
      await expect(
        service.create(1, {
          unitNumber: 'TRL-5301',
          equipmentType: 'DRY_VAN',
          reeferMake: 'Carrier',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow reefer fields on REEFER type', async () => {
      const created = makeTrailer({
        equipmentType: 'REEFER',
        reeferMake: 'Carrier',
      });
      prisma.trailer.create.mockResolvedValue(created);

      const result = await service.create(1, {
        unitNumber: 'TRL-5301',
        equipmentType: 'REEFER',
        reeferMake: 'Carrier',
      } as any);

      expect(result).toBeDefined();
      expect(result.reeferMake).toBe('Carrier');
    });
  });

  // ─── update ──────────────────────────────────────────────

  describe('update', () => {
    it('should update fields on existing trailer', async () => {
      const existing = makeTrailer();
      prisma.trailer.findFirst.mockResolvedValue(existing);
      const updated = makeTrailer({ make: 'Wabash' });
      prisma.trailer.update.mockResolvedValue(updated);

      const result = await service.update('TRL-TEST001', 1, {
        make: 'Wabash',
      } as any);

      expect(prisma.trailer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: existing.id },
        }),
      );
      expect(result.make).toBe('Wabash');
    });

    it('should emit TRAILER_UPDATED event', async () => {
      const existing = makeTrailer();
      prisma.trailer.findFirst.mockResolvedValue(existing);
      prisma.trailer.update.mockResolvedValue(existing);

      await service.update('TRL-TEST001', 1, { notes: 'test' } as any);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.TRAILER_UPDATED,
        expect.anything(), // tenantId
        expect.objectContaining({
          entityType: 'trailer',
        }),
      );
    });

    it('should throw NotFoundException for non-existent trailer', async () => {
      prisma.trailer.findFirst.mockResolvedValue(null);

      await expect(service.update('nonexistent', 1, { make: 'Wabash' } as any)).rejects.toThrow(NotFoundException);
    });

    it('should reject reefer fields when resolvedEquipmentType is not REEFER', async () => {
      const existing = makeTrailer({ equipmentType: 'DRY_VAN' });
      prisma.trailer.findFirst.mockResolvedValue(existing);

      await expect(service.update('TRL-TEST001', 1, { reeferMake: 'Carrier' } as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── deactivate ──────────────────────────────────────────

  describe('deactivate', () => {
    it('should deactivate an active trailer', async () => {
      const trailer = makeTrailer({ lifecycleStatus: 'ACTIVE' });
      prisma.trailer.findFirst.mockResolvedValue(trailer);
      prisma.load.count.mockResolvedValue(0);
      const deactivated = makeTrailer({
        lifecycleStatus: 'INACTIVE',
        status: 'OUT_OF_SERVICE',
        deactivatedAt: new Date(),
        deactivatedBy: 100,
        deactivationReason: 'Not needed',
      });
      prisma.trailer.update.mockResolvedValue(deactivated);

      const result = await service.deactivate('TRL-TEST001', 1, 100, 'Not needed');

      expect(result.lifecycleStatus).toBe('INACTIVE');
      expect(result.status).toBe('OUT_OF_SERVICE');
    });

    it('should set lifecycleStatus INACTIVE and status OUT_OF_SERVICE', async () => {
      const trailer = makeTrailer({ lifecycleStatus: 'ACTIVE' });
      prisma.trailer.findFirst.mockResolvedValue(trailer);
      prisma.load.count.mockResolvedValue(0);
      prisma.trailer.update.mockResolvedValue(makeTrailer({ lifecycleStatus: 'INACTIVE', status: 'OUT_OF_SERVICE' }));

      await service.deactivate('TRL-TEST001', 1, 100, 'reason');

      expect(prisma.trailer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lifecycleStatus: 'INACTIVE',
            status: 'OUT_OF_SERVICE',
          }),
        }),
      );
    });

    it('should store deactivation reason, userId, and timestamp', async () => {
      const trailer = makeTrailer({ lifecycleStatus: 'ACTIVE' });
      prisma.trailer.findFirst.mockResolvedValue(trailer);
      prisma.load.count.mockResolvedValue(0);
      prisma.trailer.update.mockResolvedValue(makeTrailer({ lifecycleStatus: 'INACTIVE' }));

      await service.deactivate('TRL-TEST001', 1, 100, 'Not needed');

      expect(prisma.trailer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deactivationReason: 'Not needed',
            deactivatedBy: 100,
            deactivatedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should unassign vehicle before deactivating', async () => {
      const trailer = makeTrailer({
        lifecycleStatus: 'ACTIVE',
        assignedVehicleId: 5,
      });
      prisma.trailer.findFirst.mockResolvedValue(trailer);
      prisma.load.count.mockResolvedValue(0);
      prisma.trailer.update.mockResolvedValue(makeTrailer({ lifecycleStatus: 'INACTIVE' }));

      await service.deactivate('TRL-TEST001', 1, 100, 'reason');

      // First update call should unassign vehicle
      expect(prisma.trailer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: trailer.id },
          data: { assignedVehicleId: null },
        }),
      );
    });

    it('should emit TRAILER_DEACTIVATED event', async () => {
      const trailer = makeTrailer({ lifecycleStatus: 'ACTIVE' });
      prisma.trailer.findFirst.mockResolvedValue(trailer);
      prisma.load.count.mockResolvedValue(0);
      prisma.trailer.update.mockResolvedValue(makeTrailer({ lifecycleStatus: 'INACTIVE' }));

      await service.deactivate('TRL-TEST001', 1, 100, 'reason');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.TRAILER_DEACTIVATED,
        expect.anything(), // tenantId
        expect.objectContaining({
          entityType: 'trailer',
        }),
      );
    });

    it('should throw BadRequestException if not ACTIVE', async () => {
      const trailer = makeTrailer({ lifecycleStatus: 'INACTIVE' });
      prisma.trailer.findFirst.mockResolvedValue(trailer);

      await expect(service.deactivate('TRL-TEST001', 1, 100, 'reason')).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if trailer has active loads', async () => {
      const trailer = makeTrailer({ id: 1, lifecycleStatus: 'ACTIVE' });
      prisma.trailer.findFirst.mockResolvedValue(trailer);
      prisma.load.count.mockResolvedValue(2);

      await expect(service.deactivate('TRL-TEST001', 1, 100, 'Shop repair')).rejects.toThrow(ConflictException);
    });
  });

  // ─── reactivate ──────────────────────────────────────────

  describe('reactivate', () => {
    it('should reactivate an inactive trailer', async () => {
      const trailer = makeTrailer({ lifecycleStatus: 'INACTIVE' });
      prisma.trailer.findFirst.mockResolvedValue(trailer);
      const reactivated = makeTrailer({
        lifecycleStatus: 'ACTIVE',
        status: 'AVAILABLE',
      });
      prisma.trailer.update.mockResolvedValue(reactivated);

      const result = await service.reactivate('TRL-TEST001', 1, 100);

      expect(result.lifecycleStatus).toBe('ACTIVE');
      expect(result.status).toBe('AVAILABLE');
    });

    it('should set lifecycleStatus ACTIVE and status AVAILABLE', async () => {
      const trailer = makeTrailer({ lifecycleStatus: 'INACTIVE' });
      prisma.trailer.findFirst.mockResolvedValue(trailer);
      prisma.trailer.update.mockResolvedValue(makeTrailer({ lifecycleStatus: 'ACTIVE', status: 'AVAILABLE' }));

      await service.reactivate('TRL-TEST001', 1, 100);

      expect(prisma.trailer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lifecycleStatus: 'ACTIVE',
            status: 'AVAILABLE',
            previousStatus: null,
          }),
        }),
      );
    });

    it('should clear deactivation fields', async () => {
      const trailer = makeTrailer({ lifecycleStatus: 'INACTIVE' });
      prisma.trailer.findFirst.mockResolvedValue(trailer);
      prisma.trailer.update.mockResolvedValue(makeTrailer({ lifecycleStatus: 'ACTIVE' }));

      await service.reactivate('TRL-TEST001', 1, 100);

      expect(prisma.trailer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deactivatedAt: null,
            deactivatedBy: null,
            deactivationReason: null,
          }),
        }),
      );
    });

    it('should emit TRAILER_REACTIVATED event', async () => {
      const trailer = makeTrailer({ lifecycleStatus: 'INACTIVE' });
      prisma.trailer.findFirst.mockResolvedValue(trailer);
      prisma.trailer.update.mockResolvedValue(makeTrailer({ lifecycleStatus: 'ACTIVE' }));

      await service.reactivate('TRL-TEST001', 1, 100);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.TRAILER_REACTIVATED,
        expect.anything(), // tenantId
        expect.objectContaining({
          entityType: 'trailer',
        }),
      );
    });

    it('should throw BadRequestException if not INACTIVE', async () => {
      const trailer = makeTrailer({ lifecycleStatus: 'ACTIVE' });
      prisma.trailer.findFirst.mockResolvedValue(trailer);

      await expect(service.reactivate('TRL-TEST001', 1, 100)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── decommission ────────────────────────────────────────

  describe('decommission', () => {
    it('should decommission a trailer', async () => {
      const trailer = makeTrailer({ lifecycleStatus: 'ACTIVE' });
      prisma.trailer.findFirst.mockResolvedValue(trailer);
      prisma.load.count.mockResolvedValue(0);
      const decommissioned = makeTrailer({
        lifecycleStatus: 'DECOMMISSIONED',
        status: 'OUT_OF_SERVICE',
      });
      prisma.trailer.update.mockResolvedValue(decommissioned);

      const result = await service.decommission('TRL-TEST001', 1, 100, 'End of life');

      expect(result.lifecycleStatus).toBe('DECOMMISSIONED');
    });

    it('should set lifecycleStatus DECOMMISSIONED', async () => {
      const trailer = makeTrailer({ lifecycleStatus: 'ACTIVE' });
      prisma.trailer.findFirst.mockResolvedValue(trailer);
      prisma.load.count.mockResolvedValue(0);
      prisma.trailer.update.mockResolvedValue(makeTrailer({ lifecycleStatus: 'DECOMMISSIONED' }));

      await service.decommission('TRL-TEST001', 1, 100, 'End of life');

      expect(prisma.trailer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lifecycleStatus: 'DECOMMISSIONED',
          }),
        }),
      );
    });

    it('should emit TRAILER_DECOMMISSIONED event', async () => {
      const trailer = makeTrailer({ lifecycleStatus: 'ACTIVE' });
      prisma.trailer.findFirst.mockResolvedValue(trailer);
      prisma.load.count.mockResolvedValue(0);
      prisma.trailer.update.mockResolvedValue(makeTrailer({ lifecycleStatus: 'DECOMMISSIONED' }));

      await service.decommission('TRL-TEST001', 1, 100, 'End of life');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.TRAILER_DECOMMISSIONED,
        expect.anything(), // tenantId
        expect.objectContaining({
          entityType: 'trailer',
        }),
      );
    });

    it('should throw BadRequestException if already DECOMMISSIONED', async () => {
      const trailer = makeTrailer({ lifecycleStatus: 'DECOMMISSIONED' });
      prisma.trailer.findFirst.mockResolvedValue(trailer);

      await expect(service.decommission('TRL-TEST001', 1, 100, 'reason')).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if trailer has active loads', async () => {
      const trailer = makeTrailer({ id: 1, lifecycleStatus: 'ACTIVE' });
      prisma.trailer.findFirst.mockResolvedValue(trailer);
      prisma.load.count.mockResolvedValue(1);

      await expect(service.decommission('TRL-TEST001', 1, 100, 'End of life')).rejects.toThrow(ConflictException);
    });
  });

  // ─── assignVehicle ───────────────────────────────────────

  describe('assignVehicle', () => {
    it('should assign vehicle to trailer and set status to ASSIGNED', async () => {
      const trailer = makeTrailer({ assignedVehicleId: null });
      prisma.trailer.findFirst.mockResolvedValue(trailer);
      prisma.vehicle.findFirst.mockResolvedValue({ id: 5, tenantId: 1 });
      // validateVehicleForAssignment: no existing assignment
      // Note: findFirst is already mocked above to return the trailer
      // We need to handle two findFirst calls: one for findOne and one for existingAssignment
      prisma.trailer.findFirst
        .mockResolvedValueOnce(trailer) // findOne
        .mockResolvedValueOnce(null); // existingAssignment check
      const assigned = makeTrailer({
        assignedVehicleId: 5,
        status: 'ASSIGNED',
        assignedVehicle: { id: 5, vehicleId: 'VEH-1', unitNumber: 'T-101' },
      });
      prisma.trailer.update.mockResolvedValue(assigned);

      const result = await service.assignVehicle('TRL-TEST001', 1, 5);

      expect(result.status).toBe('ASSIGNED');
      expect(result.assignedVehicleId).toBe(5);
    });

    it('should validate vehicle exists in same tenant', async () => {
      const trailer = makeTrailer({ assignedVehicleId: null });
      prisma.trailer.findFirst.mockResolvedValue(trailer);
      prisma.vehicle.findFirst.mockResolvedValue(null); // vehicle not found

      await expect(service.assignVehicle('TRL-TEST001', 1, 999)).rejects.toThrow(NotFoundException);
    });

    it('should validate vehicle not assigned to different trailer', async () => {
      const trailer = makeTrailer({ id: 1, assignedVehicleId: null });
      prisma.trailer.findFirst
        .mockResolvedValueOnce(trailer) // findOne
        .mockResolvedValueOnce({ id: 2, assignedVehicleId: 5 }); // existingAssignment
      prisma.vehicle.findFirst.mockResolvedValue({ id: 5, tenantId: 1 });

      await expect(service.assignVehicle('TRL-TEST001', 1, 5)).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if trailer already assigned to different vehicle', async () => {
      const trailer = makeTrailer({ assignedVehicleId: 10 });
      prisma.trailer.findFirst.mockResolvedValue(trailer);

      await expect(service.assignVehicle('TRL-TEST001', 1, 5)).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if vehicle not found', async () => {
      const trailer = makeTrailer({ assignedVehicleId: null });
      prisma.trailer.findFirst.mockResolvedValue(trailer);
      prisma.vehicle.findFirst.mockResolvedValue(null);

      await expect(service.assignVehicle('TRL-TEST001', 1, 5)).rejects.toThrow(NotFoundException);
    });

    it('should emit TRAILER_ASSIGNED event', async () => {
      const trailer = makeTrailer({ assignedVehicleId: null });
      prisma.trailer.findFirst
        .mockResolvedValueOnce(trailer) // findOne
        .mockResolvedValueOnce(null); // existingAssignment check
      prisma.vehicle.findFirst.mockResolvedValue({ id: 5, tenantId: 1 });
      const assigned = makeTrailer({
        assignedVehicleId: 5,
        status: 'ASSIGNED',
      });
      prisma.trailer.update.mockResolvedValue(assigned);

      await service.assignVehicle('TRL-TEST001', 1, 5);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.TRAILER_ASSIGNED,
        expect.anything(), // tenantId
        expect.objectContaining({
          entityType: 'trailer',
        }),
      );
    });

    it('should handle P2002 unique constraint as ConflictException', async () => {
      const trailer = makeTrailer({ assignedVehicleId: null });
      prisma.trailer.findFirst.mockResolvedValueOnce(trailer).mockResolvedValueOnce(null);
      prisma.vehicle.findFirst.mockResolvedValue({ id: 5, tenantId: 1 });
      const prismaError = new Error('Unique constraint');
      (prismaError as any).code = 'P2002';
      prisma.trailer.update.mockRejectedValue(prismaError);

      await expect(service.assignVehicle('TRL-TEST001', 1, 5)).rejects.toThrow(ConflictException);
    });
  });

  // ─── unassignVehicle ─────────────────────────────────────

  describe('unassignVehicle', () => {
    it('should unassign vehicle and set status to AVAILABLE', async () => {
      const trailer = makeTrailer({
        assignedVehicleId: 5,
        status: 'ASSIGNED',
      });
      prisma.trailer.findFirst.mockResolvedValue(trailer);
      const unassigned = makeTrailer({
        assignedVehicleId: null,
        status: 'AVAILABLE',
        assignedVehicle: null,
      });
      prisma.trailer.update.mockResolvedValue(unassigned);

      const result = await service.unassignVehicle('TRL-TEST001', 1);

      expect(result.status).toBe('AVAILABLE');
      expect(result.assignedVehicleId).toBeNull();
    });

    it('should throw BadRequestException if not assigned', async () => {
      const trailer = makeTrailer({ assignedVehicleId: null });
      prisma.trailer.findFirst.mockResolvedValue(trailer);

      await expect(service.unassignVehicle('TRL-TEST001', 1)).rejects.toThrow(BadRequestException);
    });

    it('should emit TRAILER_UNASSIGNED event', async () => {
      const trailer = makeTrailer({
        assignedVehicleId: 5,
        status: 'ASSIGNED',
      });
      prisma.trailer.findFirst.mockResolvedValue(trailer);
      prisma.trailer.update.mockResolvedValue(makeTrailer({ assignedVehicleId: null, status: 'AVAILABLE' }));

      await service.unassignVehicle('TRL-TEST001', 1);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.TRAILER_UNASSIGNED,
        expect.anything(), // tenantId
        expect.objectContaining({
          entityType: 'trailer',
        }),
      );
    });

    it('should preserve non-ASSIGNED status (e.g., IN_SHOP stays IN_SHOP)', async () => {
      const trailer = makeTrailer({
        assignedVehicleId: 5,
        status: 'IN_SHOP',
      });
      prisma.trailer.findFirst.mockResolvedValue(trailer);
      const unassigned = makeTrailer({
        assignedVehicleId: null,
        status: 'IN_SHOP',
      });
      prisma.trailer.update.mockResolvedValue(unassigned);

      await service.unassignVehicle('TRL-TEST001', 1);

      // Should NOT change status since it's not ASSIGNED
      const updateCall = prisma.trailer.update.mock.calls[0][0];
      expect(updateCall.data.status).toBeUndefined();
    });
  });

  // ─── formatResponse ──────────────────────────────────────

  describe('formatResponse', () => {
    it('should format all fields correctly', () => {
      const trailer = makeTrailer({
        registrationExpiry: new Date('2027-06-15'),
        insuranceExpiry: new Date('2027-06-15'),
        annualInspectionDate: new Date('2026-01-15'),
        nextMaintenanceDate: new Date('2027-03-01'),
        assignedVehicle: { id: 5, vehicleId: 'VEH-1', unitNumber: 'T-101' },
        lastSyncedAt: new Date('2026-01-01T12:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      });

      const result = service.formatResponse(trailer);

      expect(result.trailerId).toBe('TRL-TEST001');
      expect(result.unitNumber).toBe('TRL-5301');
      expect(result.equipmentType).toBe('DRY_VAN');
      expect(result.assignedVehicle).toEqual({
        id: 5,
        vehicleId: 'VEH-1',
        unitNumber: 'T-101',
      });
      expect(result.registrationExpiry).toBe('2027-06-15');
      expect(result.insuranceExpiry).toBe('2027-06-15');
      expect(result.annualInspectionDate).toBe('2026-01-15');
      expect(result.nextMaintenanceDate).toBe('2027-03-01');
    });

    it('should handle null assignedVehicle', () => {
      const trailer = makeTrailer({ assignedVehicle: null });

      const result = service.formatResponse(trailer);

      expect(result.assignedVehicle).toBeNull();
    });

    it('should format date fields as YYYY-MM-DD strings', () => {
      const trailer = makeTrailer({
        registrationExpiry: new Date('2027-12-31'),
        insuranceExpiry: null,
        annualInspectionDate: null,
        nextMaintenanceDate: new Date('2027-06-01'),
      });

      const result = service.formatResponse(trailer);

      expect(result.registrationExpiry).toBe('2027-12-31');
      expect(result.insuranceExpiry).toBeNull();
      expect(result.annualInspectionDate).toBeNull();
      expect(result.nextMaintenanceDate).toBe('2027-06-01');
    });
  });
});

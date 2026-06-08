import { Test, TestingModule } from '@nestjs/testing';
import { TrailersController } from '../trailers.controller';
import { TrailersService } from '../../services/trailers.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('TrailersController', () => {
  let controller: TrailersController;

  const mockUser = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    tenantDbId: 1,
    dbId: 100,
    role: 'ADMIN',
  };

  const mockTenant = { id: 1, tenantId: 'tenant-1' };

  const mockPrisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue(mockTenant) },
  };

  const mockTrailersService = {
    findAll: jest.fn(),
    findInactive: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    reactivate: jest.fn(),
    decommission: jest.fn(),
    assignVehicle: jest.fn(),
    unassignVehicle: jest.fn(),
    formatResponse: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrailersController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TrailersService, useValue: mockTrailersService },
      ],
    }).compile();

    controller = module.get<TrailersController>(TrailersController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listTrailers ────────────────────────────────────────

  describe('GET / (listTrailers)', () => {
    it('should call findAll with correct tenantId and includeInactive=false by default', async () => {
      mockTrailersService.findAll.mockResolvedValue([]);

      const result = await controller.listTrailers(mockUser);

      expect(mockTrailersService.findAll).toHaveBeenCalledWith(1, false);
      expect(result).toEqual([]);
    });

    it('should pass includeInactive=true when query param is "true"', async () => {
      mockTrailersService.findAll.mockResolvedValue([]);

      await controller.listTrailers(mockUser, 'true');

      expect(mockTrailersService.findAll).toHaveBeenCalledWith(1, true);
    });
  });

  // ─── listInactiveTrailers ────────────────────────────────

  describe('GET /inactive/list (listInactiveTrailers)', () => {
    it('should call findInactive with tenantId', async () => {
      mockTrailersService.findInactive.mockResolvedValue([]);

      const result = await controller.listInactiveTrailers(mockUser);

      expect(mockTrailersService.findInactive).toHaveBeenCalledWith(1);
      expect(result).toEqual([]);
    });
  });

  // ─── getTrailer ──────────────────────────────────────────

  describe('GET /:trailer_id (getTrailer)', () => {
    it('should call findOne then formatResponse', async () => {
      const trailer = { trailerId: 'TRL-001', unitNumber: 'TRL-5301' };
      mockTrailersService.findOne.mockResolvedValue(trailer);
      mockTrailersService.formatResponse.mockReturnValue({
        trailerId: 'TRL-001',
        unitNumber: 'TRL-5301',
        formatted: true,
      });

      const result = await controller.getTrailer('TRL-001', mockUser);

      expect(mockTrailersService.findOne).toHaveBeenCalledWith('TRL-001', 1);
      expect(mockTrailersService.formatResponse).toHaveBeenCalledWith(trailer);
      expect(result.trailerId).toBe('TRL-001');
    });
  });

  // ─── createTrailer ───────────────────────────────────────

  describe('POST / (createTrailer)', () => {
    it('should call create with tenantId and dto', async () => {
      const dto = {
        unitNumber: 'TRL-5302',
        equipmentType: 'DRY_VAN',
      } as any;
      const created = { trailerId: 'TRL-NEW', unitNumber: 'TRL-5302' };
      mockTrailersService.create.mockResolvedValue(created);

      const result = await controller.createTrailer(mockUser, dto);

      expect(mockTrailersService.create).toHaveBeenCalledWith(1, expect.objectContaining({ unitNumber: 'TRL-5302' }));
      expect(result.trailerId).toBe('TRL-NEW');
    });
  });

  // ─── updateTrailer ───────────────────────────────────────

  describe('PUT /:trailer_id (updateTrailer)', () => {
    it('should call update with trailerId, tenantId, and dto', async () => {
      const dto = { make: 'Wabash' } as any;
      const updated = { trailerId: 'TRL-001', make: 'Wabash' };
      mockTrailersService.update.mockResolvedValue(updated);

      const result = await controller.updateTrailer('TRL-001', mockUser, dto);

      expect(mockTrailersService.update).toHaveBeenCalledWith(
        'TRL-001',
        1,
        expect.objectContaining({ make: 'Wabash' }),
      );
      expect(result.make).toBe('Wabash');
    });
  });

  // ─── deactivateTrailer ───────────────────────────────────

  describe('POST /:trailer_id/deactivate', () => {
    it('should call deactivate with user.dbId and reason', async () => {
      mockTrailersService.deactivate.mockResolvedValue({
        lifecycleStatus: 'INACTIVE',
      });

      await controller.deactivateTrailer('TRL-001', { reason: 'Not needed' }, mockUser);

      expect(mockTrailersService.deactivate).toHaveBeenCalledWith('TRL-001', 1, 100, 'Not needed');
    });
  });

  // ─── reactivateTrailer ───────────────────────────────────

  describe('POST /:trailer_id/reactivate', () => {
    it('should call reactivate with user.dbId', async () => {
      mockTrailersService.reactivate.mockResolvedValue({
        lifecycleStatus: 'ACTIVE',
      });

      await controller.reactivateTrailer('TRL-001', mockUser);

      expect(mockTrailersService.reactivate).toHaveBeenCalledWith('TRL-001', 1, 100);
    });
  });

  // ─── decommissionTrailer ─────────────────────────────────

  describe('POST /:trailer_id/decommission', () => {
    it('should call decommission with user.dbId and reason', async () => {
      mockTrailersService.decommission.mockResolvedValue({
        lifecycleStatus: 'DECOMMISSIONED',
      });

      await controller.decommissionTrailer('TRL-001', { reason: 'End of life' }, mockUser);

      expect(mockTrailersService.decommission).toHaveBeenCalledWith('TRL-001', 1, 100, 'End of life');
    });
  });

  // ─── assignVehicle ───────────────────────────────────────

  describe('POST /:trailer_id/assign-vehicle', () => {
    it('should call assignVehicle with vehicleId', async () => {
      mockTrailersService.assignVehicle.mockResolvedValue({
        status: 'ASSIGNED',
        assignedVehicleId: 5,
      });

      await controller.assignVehicle('TRL-001', { vehicleId: 5 }, mockUser);

      expect(mockTrailersService.assignVehicle).toHaveBeenCalledWith('TRL-001', 1, 5);
    });
  });

  // ─── unassignVehicle ─────────────────────────────────────

  describe('POST /:trailer_id/unassign-vehicle', () => {
    it('should call unassignVehicle', async () => {
      mockTrailersService.unassignVehicle.mockResolvedValue({
        status: 'AVAILABLE',
        assignedVehicleId: null,
      });

      await controller.unassignVehicle('TRL-001', mockUser);

      expect(mockTrailersService.unassignVehicle).toHaveBeenCalledWith('TRL-001', 1);
    });
  });
});

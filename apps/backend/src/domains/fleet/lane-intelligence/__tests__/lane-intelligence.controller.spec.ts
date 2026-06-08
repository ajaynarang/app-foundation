import { Test, TestingModule } from '@nestjs/testing';
import { LaneIntelligenceController } from '../lane-intelligence.controller';
import { LaneIntelligenceService } from '../lane-intelligence.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

describe('LaneIntelligenceController', () => {
  let controller: LaneIntelligenceController;

  const mockTenant = { id: 1, tenantId: 'tenant-1' };

  const mockUser = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    dbId: 1,
    role: 'DISPATCHER',
  };

  const mockPrisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue(mockTenant) },
  };

  const mockLaneIntelService = {
    getLaneIntelligence: jest.fn(),
    listTargets: jest.fn(),
    upsertTarget: jest.fn(),
    deleteTarget: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LaneIntelligenceController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LaneIntelligenceService, useValue: mockLaneIntelService },
      ],
    }).compile();

    controller = module.get<LaneIntelligenceController>(LaneIntelligenceController);
  });

  afterEach(() => jest.clearAllMocks());

  // ── GET /fleet/lane-rate ──

  describe('getLaneIntelligence', () => {
    it('returns lane intelligence for origin/destination pair', async () => {
      const intel = { computed: { avgRateCentsPerMile: 286 }, target: null };
      mockLaneIntelService.getLaneIntelligence.mockResolvedValue(intel);

      const result = await controller.getLaneIntelligence(mockUser, 'tx', 'il');

      expect(mockLaneIntelService.getLaneIntelligence).toHaveBeenCalledWith(1, 'TX', 'IL', undefined);
      expect(result).toEqual(intel);
    });

    it('converts states to uppercase', async () => {
      mockLaneIntelService.getLaneIntelligence.mockResolvedValue({});

      await controller.getLaneIntelligence(mockUser, 'ca', 'ny', 'dry_van');

      expect(mockLaneIntelService.getLaneIntelligence).toHaveBeenCalledWith(1, 'CA', 'NY', 'dry_van');
    });

    it('passes equipmentType when provided', async () => {
      mockLaneIntelService.getLaneIntelligence.mockResolvedValue({});

      await controller.getLaneIntelligence(mockUser, 'TX', 'IL', 'reefer');

      expect(mockLaneIntelService.getLaneIntelligence).toHaveBeenCalledWith(1, 'TX', 'IL', 'reefer');
    });

    it('passes undefined equipmentType when empty string', async () => {
      mockLaneIntelService.getLaneIntelligence.mockResolvedValue({});

      await controller.getLaneIntelligence(mockUser, 'TX', 'IL', '');

      expect(mockLaneIntelService.getLaneIntelligence).toHaveBeenCalledWith(1, 'TX', 'IL', undefined);
    });
  });

  // ── GET /fleet/lane-rate-targets ──

  describe('listTargets', () => {
    it('returns all lane rate targets', async () => {
      const targets = [{ laneRateTargetId: 'target-1' }];
      mockLaneIntelService.listTargets.mockResolvedValue(targets);

      const result = await controller.listTargets(mockUser);

      expect(mockLaneIntelService.listTargets).toHaveBeenCalledWith(1);
      expect(result).toEqual(targets);
    });
  });

  // ── PUT /fleet/lane-rate-targets ──

  describe('upsertTarget', () => {
    it('creates or updates a lane rate target', async () => {
      const dto = {
        originState: 'TX',
        destinationState: 'IL',
        targetRateCentsPerMile: 300,
      } as any;
      const upserted = { laneRateTargetId: 'target-1' };
      mockLaneIntelService.upsertTarget.mockResolvedValue(upserted);

      const result = await controller.upsertTarget(mockUser, dto);

      expect(mockLaneIntelService.upsertTarget).toHaveBeenCalledWith(1, 1, dto);
      expect(result).toEqual(upserted);
    });
  });

  // ── DELETE /fleet/lane-rate-targets/:lane_rate_target_id ──

  describe('deleteTarget', () => {
    it('deletes a lane rate target and returns success', async () => {
      mockLaneIntelService.deleteTarget.mockResolvedValue(undefined);

      const result = await controller.deleteTarget('target-1', mockUser);

      expect(mockLaneIntelService.deleteTarget).toHaveBeenCalledWith('target-1', 1);
      expect(result).toEqual({ success: true });
    });
  });
});

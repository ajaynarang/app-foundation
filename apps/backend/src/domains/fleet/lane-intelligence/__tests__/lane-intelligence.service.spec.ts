import { NotFoundException } from '@nestjs/common';
import { LaneIntelligenceService } from '../lane-intelligence.service';

describe('LaneIntelligenceService', () => {
  let service: LaneIntelligenceService;
  const mockPrisma = {
    $queryRaw: jest.fn(),
    laneRateTarget: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(() => {
    service = new LaneIntelligenceService(mockPrisma as any);
    jest.clearAllMocks();
  });

  // ── getLaneIntelligence ──

  describe('getLaneIntelligence', () => {
    it('returns computed stats and target when both exist', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          load_count: BigInt(8),
          avg_rate_per_mile: 285.5,
          min_rate_per_mile: 240.0,
          max_rate_per_mile: 350.0,
          recent_avg: 300.0,
          older_avg: 270.0,
        },
      ]);
      mockPrisma.laneRateTarget.findMany.mockResolvedValue([
        {
          laneRateTargetId: 'target-1',
          originState: 'TX',
          destinationState: 'IL',
          targetRateCentsPerMile: 300,
          notes: null,
          equipmentType: 'ALL',
          setByUserName: 'Mike',
          updatedAt: new Date('2026-03-15'),
        },
      ]);

      const result = await service.getLaneIntelligence(1, 'TX', 'IL');

      expect(result.computed).not.toBeNull();
      expect(result.computed.avgRateCentsPerMile).toBe(286); // Math.round(285.5)
      expect(result.computed.minRateCentsPerMile).toBe(240);
      expect(result.computed.maxRateCentsPerMile).toBe(350);
      expect(result.computed.loadCount).toBe(8);
      expect(result.computed.confidence).toBe('high');
      expect(result.computed.trend).toBe('up'); // 300 vs 270 = +11%
      expect(result.target).not.toBeNull();
      expect(result.target.targetRateCentsPerMile).toBe(300);
    });

    it('returns null computed when load count is below threshold', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          load_count: BigInt(2),
          avg_rate_per_mile: 285.0,
          min_rate_per_mile: 240.0,
          max_rate_per_mile: 350.0,
          recent_avg: null,
          older_avg: null,
        },
      ]);
      mockPrisma.laneRateTarget.findMany.mockResolvedValue([]);

      const result = await service.getLaneIntelligence(1, 'TX', 'IL');

      expect(result.computed).toBeNull();
      expect(result.target).toBeNull();
    });

    it('returns null computed when no rows returned', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.laneRateTarget.findMany.mockResolvedValue([]);

      const result = await service.getLaneIntelligence(1, 'TX', 'IL');

      expect(result.computed).toBeNull();
    });

    it('returns low confidence for 3-5 loads', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          load_count: BigInt(4),
          avg_rate_per_mile: 300.0,
          min_rate_per_mile: 280.0,
          max_rate_per_mile: 320.0,
          recent_avg: null,
          older_avg: null,
        },
      ]);
      mockPrisma.laneRateTarget.findMany.mockResolvedValue([]);

      const result = await service.getLaneIntelligence(1, 'TX', 'IL');

      expect(result.computed.confidence).toBe('low');
      expect(result.computed.loadCount).toBe(4);
    });

    it('computes flat trend when recent and older avg are similar', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          load_count: BigInt(10),
          avg_rate_per_mile: 300.0,
          min_rate_per_mile: 280.0,
          max_rate_per_mile: 320.0,
          recent_avg: 302.0,
          older_avg: 298.0,
        },
      ]);
      mockPrisma.laneRateTarget.findMany.mockResolvedValue([]);

      const result = await service.getLaneIntelligence(1, 'TX', 'IL');

      expect(result.computed.trend).toBe('flat'); // 1.3% < 5% threshold
    });

    it('computes down trend when recent is below older', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          load_count: BigInt(10),
          avg_rate_per_mile: 275.0,
          min_rate_per_mile: 240.0,
          max_rate_per_mile: 320.0,
          recent_avg: 250.0,
          older_avg: 300.0,
        },
      ]);
      mockPrisma.laneRateTarget.findMany.mockResolvedValue([]);

      const result = await service.getLaneIntelligence(1, 'TX', 'IL');

      expect(result.computed.trend).toBe('down'); // -16.7%
    });

    it('returns flat trend when only recent data exists (no older window)', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          load_count: BigInt(6),
          avg_rate_per_mile: 300.0,
          min_rate_per_mile: 280.0,
          max_rate_per_mile: 320.0,
          recent_avg: 300.0,
          older_avg: null,
        },
      ]);
      mockPrisma.laneRateTarget.findMany.mockResolvedValue([]);

      const result = await service.getLaneIntelligence(1, 'TX', 'IL');

      expect(result.computed.trend).toBe('flat');
    });
  });

  // ── Target lookup (findTarget) ──

  describe('target lookup', () => {
    it('prefers equipment-specific target over ALL fallback', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          load_count: BigInt(0),
          avg_rate_per_mile: null,
          min_rate_per_mile: null,
          max_rate_per_mile: null,
          recent_avg: null,
          older_avg: null,
        },
      ]);
      mockPrisma.laneRateTarget.findMany.mockResolvedValue([
        {
          laneRateTargetId: 'target-all',
          originState: 'TX',
          destinationState: 'IL',
          targetRateCentsPerMile: 250,
          notes: null,
          equipmentType: 'ALL',
          setByUserName: 'Mike',
          updatedAt: new Date(),
        },
        {
          laneRateTargetId: 'target-reefer',
          originState: 'TX',
          destinationState: 'IL',
          targetRateCentsPerMile: 350,
          notes: null,
          equipmentType: 'reefer',
          setByUserName: 'Mike',
          updatedAt: new Date(),
        },
      ]);

      const result = await service.getLaneIntelligence(1, 'TX', 'IL', 'reefer');

      expect(result.target.targetRateCentsPerMile).toBe(350);
      expect(result.target.equipmentType).toBe('reefer');
    });

    it('falls back to ALL target when no equipment-specific target', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          load_count: BigInt(0),
          avg_rate_per_mile: null,
          min_rate_per_mile: null,
          max_rate_per_mile: null,
          recent_avg: null,
          older_avg: null,
        },
      ]);
      mockPrisma.laneRateTarget.findMany.mockResolvedValue([
        {
          laneRateTargetId: 'target-all',
          originState: 'TX',
          destinationState: 'IL',
          targetRateCentsPerMile: 250,
          notes: null,
          equipmentType: 'ALL',
          setByUserName: 'Mike',
          updatedAt: new Date(),
        },
      ]);

      const result = await service.getLaneIntelligence(1, 'TX', 'IL', 'dry_van');

      expect(result.target.targetRateCentsPerMile).toBe(250);
      expect(result.target.equipmentType).toBe('ALL');
    });

    it('returns null target when none exist', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          load_count: BigInt(0),
          avg_rate_per_mile: null,
          min_rate_per_mile: null,
          max_rate_per_mile: null,
          recent_avg: null,
          older_avg: null,
        },
      ]);
      mockPrisma.laneRateTarget.findMany.mockResolvedValue([]);

      const result = await service.getLaneIntelligence(1, 'TX', 'IL');

      expect(result.target).toBeNull();
    });
  });

  // ── upsertTarget ──

  describe('upsertTarget', () => {
    it('creates a new target with user name from DB', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        firstName: 'Mike',
        lastName: 'Johnson',
        email: 'mike@test.com',
      });
      mockPrisma.laneRateTarget.upsert.mockResolvedValue({
        laneRateTargetId: 'new-target',
        originState: 'TX',
        destinationState: 'IL',
        targetRateCentsPerMile: 300,
        notes: null,
        equipmentType: 'ALL',
        setByUserName: 'Mike Johnson',
        updatedAt: new Date('2026-04-08'),
      });

      const result = await service.upsertTarget(1, 42, {
        originState: 'TX',
        destinationState: 'IL',
        targetRateCentsPerMile: 300,
      });

      expect(result.targetRateCentsPerMile).toBe(300);
      expect(result.setByUserName).toBe('Mike Johnson');
      expect(mockPrisma.laneRateTarget.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId_originState_destinationState_equipmentType: expect.objectContaining({
              tenantId: 1,
              originState: 'TX',
              destinationState: 'IL',
              equipmentType: 'ALL',
            }),
          }),
        }),
      );
    });

    it('uses email when name is empty', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        firstName: null,
        lastName: null,
        email: 'dispatch@fleet.com',
      });
      mockPrisma.laneRateTarget.upsert.mockResolvedValue({
        laneRateTargetId: 'target-1',
        originState: 'TX',
        destinationState: 'IL',
        targetRateCentsPerMile: 300,
        notes: null,
        equipmentType: 'ALL',
        setByUserName: 'dispatch@fleet.com',
        updatedAt: new Date(),
      });

      await service.upsertTarget(1, 42, {
        originState: 'TX',
        destinationState: 'IL',
        targetRateCentsPerMile: 300,
      });

      expect(mockPrisma.laneRateTarget.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            setByUserName: 'dispatch@fleet.com',
          }),
        }),
      );
    });

    it('uses equipment type when provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        firstName: 'Mike',
        lastName: 'J',
        email: 'mike@test.com',
      });
      mockPrisma.laneRateTarget.upsert.mockResolvedValue({
        laneRateTargetId: 'target-1',
        originState: 'TX',
        destinationState: 'IL',
        targetRateCentsPerMile: 400,
        notes: null,
        equipmentType: 'reefer',
        setByUserName: 'Mike J',
        updatedAt: new Date(),
      });

      await service.upsertTarget(1, 42, {
        originState: 'TX',
        destinationState: 'IL',
        targetRateCentsPerMile: 400,
        equipmentType: 'reefer',
      });

      expect(mockPrisma.laneRateTarget.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId_originState_destinationState_equipmentType: expect.objectContaining({
              equipmentType: 'reefer',
            }),
          }),
        }),
      );
    });
  });

  // ── deleteTarget ──

  describe('deleteTarget', () => {
    it('deletes an existing target', async () => {
      mockPrisma.laneRateTarget.findFirst.mockResolvedValue({
        id: 5,
        laneRateTargetId: 'target-1',
        tenantId: 1,
      });
      mockPrisma.laneRateTarget.delete.mockResolvedValue({});

      await service.deleteTarget('target-1', 1);

      expect(mockPrisma.laneRateTarget.delete).toHaveBeenCalledWith({
        where: { id: 5 },
      });
    });

    it('throws NotFoundException when target does not exist', async () => {
      mockPrisma.laneRateTarget.findFirst.mockResolvedValue(null);

      await expect(service.deleteTarget('nonexistent', 1)).rejects.toThrow(NotFoundException);
    });

    it('scopes delete by tenantId', async () => {
      mockPrisma.laneRateTarget.findFirst.mockResolvedValue(null);

      await expect(service.deleteTarget('target-1', 999)).rejects.toThrow(NotFoundException);

      expect(mockPrisma.laneRateTarget.findFirst).toHaveBeenCalledWith({
        where: { laneRateTargetId: 'target-1', tenantId: 999 },
      });
    });
  });

  // ── listTargets ──

  describe('listTargets', () => {
    it('returns all targets for a tenant sorted by origin/dest', async () => {
      mockPrisma.laneRateTarget.findMany.mockResolvedValue([
        {
          laneRateTargetId: 'target-1',
          originState: 'CA',
          destinationState: 'TX',
          targetRateCentsPerMile: 280,
          notes: null,
          equipmentType: 'ALL',
          setByUserName: 'Mike',
          updatedAt: new Date('2026-04-01'),
        },
        {
          laneRateTargetId: 'target-2',
          originState: 'TX',
          destinationState: 'IL',
          targetRateCentsPerMile: 300,
          notes: 'Min rate',
          equipmentType: 'ALL',
          setByUserName: 'Jane',
          updatedAt: new Date('2026-04-05'),
        },
      ]);

      const result = await service.listTargets(1);

      expect(result).toHaveLength(2);
      expect(result[0].originState).toBe('CA');
      expect(result[1].originState).toBe('TX');
      expect(mockPrisma.laneRateTarget.findMany).toHaveBeenCalledWith({
        where: { tenantId: 1 },
        orderBy: [{ originState: 'asc' }, { destinationState: 'asc' }],
      });
    });

    it('returns empty array when no targets exist', async () => {
      mockPrisma.laneRateTarget.findMany.mockResolvedValue([]);

      const result = await service.listTargets(1);

      expect(result).toEqual([]);
    });
  });
});

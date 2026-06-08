import { LaneRateService } from '../lane-rate.service';

describe('LaneRateService', () => {
  let service: LaneRateService;
  const mockPrisma = {
    $queryRaw: jest.fn(),
  };

  beforeEach(() => {
    service = new LaneRateService(mockPrisma as any);
    jest.clearAllMocks();
  });

  describe('getLaneInsights', () => {
    it('returns lane insights for lanes with enough history', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          origin_state: 'IL',
          destination_state: 'TX',
          load_count: BigInt(5),
          avg_rate_cents: 250000,
          avg_miles: 1000,
        },
      ]);

      const result = await service.getLaneInsights(1, [{ originState: 'IL', destState: 'TX' }]);

      expect(result.get('IL-TX')).toBeDefined();
      const insight = result.get('IL-TX');
      expect(insight.loadCount).toBe(5);
      expect(insight.avgRatePerMile).toBe(2.5); // 250000 / 100 / 1000
      expect(insight.verdict).toBe('market_rate');
    });

    it('returns empty map for lanes with insufficient history', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getLaneInsights(1, [{ originState: 'IL', destState: 'TX' }]);

      expect(result.get('IL-TX')).toBeUndefined();
    });

    it('returns empty map for empty lanes input', async () => {
      const result = await service.getLaneInsights(1, []);
      expect(result.size).toBe(0);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('filters out lanes not in the request', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          origin_state: 'IL',
          destination_state: 'TX',
          load_count: BigInt(5),
          avg_rate_cents: 28500,
          avg_miles: 1000,
        },
        {
          origin_state: 'IL',
          destination_state: 'CA',
          load_count: BigInt(4),
          avg_rate_cents: 35000,
          avg_miles: 2000,
        },
      ]);

      // Only asked for IL→TX, not IL→CA
      const result = await service.getLaneInsights(1, [{ originState: 'IL', destState: 'TX' }]);

      expect(result.get('IL-TX')).toBeDefined();
      expect(result.get('IL-CA')).toBeUndefined();
    });
  });

  describe('computeVerdict', () => {
    it('returns above_market when listing is significantly above average', () => {
      const result = service.computeVerdict(3.5, 2.5);
      expect(result.verdict).toBe('above_market');
      expect(result.percentDiff).toBe(40);
    });

    it('returns below_market when listing is significantly below average', () => {
      const result = service.computeVerdict(2.0, 3.0);
      expect(result.verdict).toBe('below_market');
      expect(result.percentDiff).toBe(-33);
    });

    it('returns market_rate when listing is within threshold', () => {
      const result = service.computeVerdict(2.51, 2.5);
      expect(result.verdict).toBe('market_rate');
    });

    it('handles zero average gracefully', () => {
      const result = service.computeVerdict(2.5, 0);
      expect(result.verdict).toBe('market_rate');
      expect(result.percentDiff).toBe(0);
    });
  });
});

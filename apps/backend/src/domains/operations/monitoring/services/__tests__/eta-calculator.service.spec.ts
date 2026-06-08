import { Test, TestingModule } from '@nestjs/testing';
import { EtaCalculatorService } from '../eta-calculator.service';
import { SallyCacheService } from '../../../../../infrastructure/cache/sally-cache.service';
import { ROUTING_PROVIDER } from '../../../../routing/providers/routing/routing-provider.interface';

const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
};

// Real routing provider (HERE). Default: rejects so tests exercise the Haversine
// fallback; individual tests override getRoute to assert road-aware ETAs.
const mockRoutingProvider = {
  getDistanceMatrix: jest.fn(),
  getRoute: jest.fn().mockRejectedValue(new Error('Not available')),
};

describe('EtaCalculatorService', () => {
  let service: EtaCalculatorService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRoutingProvider.getRoute.mockRejectedValue(new Error('Not available'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EtaCalculatorService,
        { provide: SallyCacheService, useValue: mockCache },
        { provide: ROUTING_PROVIDER, useValue: mockRoutingProvider },
      ],
    }).compile();

    service = module.get<EtaCalculatorService>(EtaCalculatorService);
  });

  describe('getEstimatedDriveMinutes', () => {
    it('should return null when from is null', async () => {
      const result = await service.getEstimatedDriveMinutes(null, {
        lat: 30,
        lon: -97,
      });
      expect(result).toBeNull();
    });

    it('should return null when to is null', async () => {
      const result = await service.getEstimatedDriveMinutes({ lat: 30, lon: -97 }, null);
      expect(result).toBeNull();
    });

    it('should return cached value when available', async () => {
      mockCache.get.mockResolvedValue(120);

      const result = await service.getEstimatedDriveMinutes({ lat: 32.78, lon: -96.8 }, { lat: 29.76, lon: -95.36 });

      expect(result).toBe(120);
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('should compute and cache when no cached value', async () => {
      mockCache.get.mockResolvedValue(null);

      const result = await service.getEstimatedDriveMinutes(
        { lat: 32.78, lon: -96.8 }, // Dallas
        { lat: 29.76, lon: -95.36 }, // Houston
      );

      expect(result).toBeGreaterThan(0);
      expect(typeof result).toBe('number');
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.stringContaining('sally:monitoring:eta:'),
        expect.any(Number),
        expect.any(Number),
      );
    });

    it('uses the REAL routing provider (road-aware), not haversine, when available', async () => {
      mockCache.get.mockResolvedValue(null);
      // HERE says 5h on the road; haversine for Dallas→Houston would be ~3.7h.
      mockRoutingProvider.getRoute.mockResolvedValue({
        distanceMiles: 240,
        driveTimeHours: 5,
        geometry: 'real_polyline',
        waypoints: [],
      });

      const result = await service.getEstimatedDriveMinutes({ lat: 32.78, lon: -96.8 }, { lat: 29.76, lon: -95.36 });

      expect(mockRoutingProvider.getRoute).toHaveBeenCalledWith(
        { lat: 32.78, lon: -96.8 },
        { lat: 29.76, lon: -95.36 },
      );
      expect(result).toBe(300); // 5h × 60 — the road-network value, not a haversine estimate
    });

    it('should handle Redis failure gracefully', async () => {
      mockCache.get.mockRejectedValue(new Error('Redis down'));

      const result = await service.getEstimatedDriveMinutes({ lat: 32.78, lon: -96.8 }, { lat: 29.76, lon: -95.36 });

      expect(result).toBeGreaterThan(0);
    });

    it('should return reasonable distance for known city pairs', async () => {
      mockCache.get.mockResolvedValue(null);

      // Dallas to Houston is ~240 miles, at ~50mph that's ~288 min
      const result = await service.getEstimatedDriveMinutes({ lat: 32.78, lon: -96.8 }, { lat: 29.76, lon: -95.36 });

      expect(result).toBeGreaterThan(200);
      expect(result).toBeLessThan(500);
    });

    it('should return 0 for same location', async () => {
      mockCache.get.mockResolvedValue(null);

      const result = await service.getEstimatedDriveMinutes({ lat: 32.78, lon: -96.8 }, { lat: 32.78, lon: -96.8 });

      expect(result).toBe(0);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { PlatformHealthService } from '../platform-health.service';
import { SallyCacheService } from '../../../infrastructure/cache/sally-cache.service';

describe('PlatformHealthService', () => {
  let service: PlatformHealthService;
  let cache: jest.Mocked<Pick<SallyCacheService, 'get' | 'set' | 'increment'>>;

  beforeEach(async () => {
    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn().mockResolvedValue(1),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [PlatformHealthService, { provide: SallyCacheService, useValue: cache }],
    }).compile();

    service = module.get(PlatformHealthService);
  });

  it('should record a successful call with EMA (first call uses response as baseline)', async () => {
    await service.recordSuccess('weather', 150);
    expect(cache.set).toHaveBeenCalledWith('sally:health:weather:last_success', expect.any(String), 86400000);
    // First call: no prior avg, so currentAvg defaults to responseMs (150)
    // EMA = round(150 * 0.9 + 150 * 0.1) = 150
    expect(cache.set).toHaveBeenCalledWith('sally:health:weather:avg_response_ms', 150, 86400000);
  });

  it('should compute EMA when a prior average exists', async () => {
    cache.get.mockImplementation(async (key: string) => {
      if (key === 'sally:health:weather:avg_response_ms') return 200 as any;
      return null as any;
    });
    await service.recordSuccess('weather', 100);
    // EMA = round(200 * 0.9 + 100 * 0.1) = round(180 + 10) = 190
    expect(cache.set).toHaveBeenCalledWith('sally:health:weather:avg_response_ms', 190, 86400000);
  });

  it('should record an error and increment error counter atomically', async () => {
    await service.recordError('weather', new Error('API timeout'));
    expect(cache.set).toHaveBeenCalledWith('sally:health:weather:last_error', expect.any(String), 86400000);
    expect(cache.set).toHaveBeenCalledWith('sally:health:weather:last_error_msg', 'API timeout', 86400000);
    expect(cache.increment).toHaveBeenCalledWith('sally:health:weather:error_count_24h', 1, 86400);
  });

  it('should return health summary for all services', async () => {
    const health = await service.getAllHealth();
    expect(health).toHaveProperty('weather');
    expect(health).toHaveProperty('fuelPrices');
    expect(health).toHaveProperty('routing');
    expect(health).toHaveProperty('geocoding');
    expect(health).toHaveProperty('mileage');
    expect(health).toHaveProperty('traffic');
    expect(health).toHaveProperty('tolls');
  });

  it('should return not_configured when no data exists', async () => {
    const health = await service.getHealth('weather');
    expect(health.status).toBe('not_configured');
  });

  it('should return healthy when last success is more recent than last error', async () => {
    cache.get.mockImplementation(async (key: string) => {
      if (key.endsWith(':last_success')) return '2026-02-24T12:00:00Z' as any;
      if (key.endsWith(':last_error')) return '2026-02-24T11:00:00Z' as any;
      return null as any;
    });
    const health = await service.getHealth('weather');
    expect(health.status).toBe('healthy');
  });

  it('should return down when last error is more recent than last success', async () => {
    cache.get.mockImplementation(async (key: string) => {
      if (key.endsWith(':last_success')) return '2026-02-24T11:00:00Z' as any;
      if (key.endsWith(':last_error')) return '2026-02-24T12:00:00Z' as any;
      return null as any;
    });
    const health = await service.getHealth('weather');
    expect(health.status).toBe('down');
  });

  it('should return degraded when error count exceeds threshold', async () => {
    cache.get.mockImplementation(async (key: string) => {
      if (key.endsWith(':last_success')) return '2026-02-24T12:00:00Z' as any;
      if (key.endsWith(':error_count_24h')) return 15 as any;
      return null as any;
    });
    const health = await service.getHealth('weather');
    expect(health.status).toBe('degraded');
  });

  // ─── withHealthTracking ─────────────────────────────────────────────────

  describe('withHealthTracking', () => {
    it('should record success and return result on success', async () => {
      const result = await service.withHealthTracking('weather', async () => {
        return { data: 'test' };
      });

      expect(result).toEqual({ data: 'test' });
      expect(cache.set).toHaveBeenCalledWith('sally:health:weather:last_success', expect.any(String), 86400000);
    });

    it('should record error and rethrow on failure', async () => {
      const error = new Error('API failed');

      await expect(
        service.withHealthTracking('routing', async () => {
          throw error;
        }),
      ).rejects.toThrow('API failed');

      expect(cache.set).toHaveBeenCalledWith('sally:health:routing:last_error', expect.any(String), 86400000);
      expect(cache.set).toHaveBeenCalledWith('sally:health:routing:last_error_msg', 'API failed', 86400000);
      expect(cache.increment).toHaveBeenCalledWith('sally:health:routing:error_count_24h', 1, 86400);
    });

    it('should wrap non-Error exceptions in Error objects', async () => {
      await expect(
        service.withHealthTracking('geocoding', async () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'string error';
        }),
      ).rejects.toBe('string error');

      expect(cache.set).toHaveBeenCalledWith('sally:health:geocoding:last_error_msg', 'string error', 86400000);
    });
  });

  // ─── getHealth detail fields ────────────────────────────────────────────

  describe('getHealth detail fields', () => {
    it('should include all detail fields when available', async () => {
      cache.get.mockImplementation(async (key: string) => {
        if (key.endsWith(':last_success')) return '2026-02-24T12:00:00Z' as any;
        if (key.endsWith(':last_error')) return '2026-02-24T11:00:00Z' as any;
        if (key.endsWith(':last_error_msg')) return 'Previous error' as any;
        if (key.endsWith(':avg_response_ms')) return 120 as any;
        if (key.endsWith(':error_count_24h')) return 3 as any;
        return null as any;
      });

      const health = await service.getHealth('weather');

      expect(health.lastSuccess).toBe('2026-02-24T12:00:00Z');
      expect(health.lastError).toBe('2026-02-24T11:00:00Z');
      expect(health.lastErrorMessage).toBe('Previous error');
      expect(health.avgResponseMs).toBe(120);
      expect(health.errorCount24h).toBe(3);
    });

    it('should return down when only error exists (no success)', async () => {
      cache.get.mockImplementation(async (key: string) => {
        if (key.endsWith(':last_error')) return '2026-02-24T12:00:00Z' as any;
        return null as any;
      });

      const health = await service.getHealth('weather');
      expect(health.status).toBe('down');
    });
  });
});

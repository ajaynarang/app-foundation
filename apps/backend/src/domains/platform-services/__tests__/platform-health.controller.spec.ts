import { Test, TestingModule } from '@nestjs/testing';
import { PlatformHealthController } from '../platform-health.controller';
import { PlatformHealthService } from '../platform-health.service';
import { PlatformBalanceService } from '../platform-balance.service';
import { PlatformServicesConfig, PlatformServiceName, PLATFORM_SERVICE_NAMES } from '../platform-services.config';

describe('PlatformHealthController', () => {
  let controller: PlatformHealthController;
  let healthService: { getAllHealth: jest.Mock };
  let balanceService: { getAllBalances: jest.Mock; refreshBalance: jest.Mock };
  let configService: { getAll: jest.Mock };

  // Build a mock config map covering all 19 service names
  const mockConfigMap: Record<PlatformServiceName, { provider: string; configured: boolean; dashboardUrl?: string }> = {
    weather: { provider: 'openweather', configured: true },
    fuelPrices: { provider: 'gasbuddy', configured: false },
    routing: { provider: 'here', configured: true },
    geocoding: { provider: 'here', configured: true },
    places: { provider: 'here', configured: true },
    mileage: { provider: 'trimble', configured: false },
    traffic: { provider: 'here', configured: true },
    tolls: { provider: 'here', configured: true },
    anthropic: {
      provider: 'Anthropic',
      configured: true,
      dashboardUrl: 'https://console.anthropic.com',
    },
    aiGateway: { provider: 'Vercel', configured: true },
    openai: { provider: 'OpenAI', configured: true },
    langfuse: { provider: 'Langfuse', configured: true },
    livekit: { provider: 'LiveKit', configured: false },
    deepgram: { provider: 'Deepgram', configured: true },
    cartesia: { provider: 'Cartesia', configured: false },
    firebaseAuth: { provider: 'Google', configured: true },
    turnstile: { provider: 'Cloudflare', configured: true },
    twilio: { provider: 'Twilio', configured: true },
    resend: { provider: 'Resend', configured: true },
    s3: { provider: 'AWS', configured: true },
  };

  // Build mock health for all services (default to not_configured)
  const mockHealthMap = Object.fromEntries(
    PLATFORM_SERVICE_NAMES.map((name) => [name, { status: 'not_configured' }]),
  ) as Record<PlatformServiceName, { status: string; lastSuccess?: string; avgResponseMs?: number }>;

  // Override a few with real data
  mockHealthMap.weather = {
    status: 'healthy',
    lastSuccess: '2026-02-24T12:00:00Z',
    avgResponseMs: 120,
  };
  mockHealthMap.routing = {
    status: 'healthy',
    lastSuccess: '2026-02-24T12:00:00Z',
    avgResponseMs: 85,
  };
  mockHealthMap.geocoding = {
    status: 'degraded',
    lastSuccess: '2026-02-24T11:00:00Z',
    avgResponseMs: 300,
  };
  mockHealthMap.traffic = {
    status: 'down',
    lastSuccess: '2026-02-24T10:00:00Z',
  };
  mockHealthMap.tolls = {
    status: 'healthy',
    lastSuccess: '2026-02-24T12:00:00Z',
    avgResponseMs: 95,
  };
  mockHealthMap.anthropic = {
    status: 'healthy',
    lastSuccess: '2026-02-24T12:00:00Z',
    avgResponseMs: 450,
  };
  mockHealthMap.twilio = {
    status: 'healthy',
    lastSuccess: '2026-02-24T12:00:00Z',
    avgResponseMs: 200,
  };

  const emptyBalance = {
    balanceUsd: null,
    monthlySpendUsd: null,
    dailyBurnRateUsd: null,
    daysRemaining: null,
    planTier: null,
    monthlyUsage: null,
    quotaLimit: null,
    quotaUsedPercent: null,
    lastProbed: null,
    probeStatus: 'unsupported' as const,
  };

  const mockBalanceMap = Object.fromEntries(PLATFORM_SERVICE_NAMES.map((name) => [name, { ...emptyBalance }]));
  (mockBalanceMap as Record<string, unknown>).twilio = {
    ...emptyBalance,
    balanceUsd: 142.5,
    dailyBurnRateUsd: 4.75,
    daysRemaining: 30,
    probeStatus: 'success',
    lastProbed: '2026-02-24T12:00:00Z',
  };

  beforeEach(async () => {
    healthService = {
      getAllHealth: jest.fn().mockResolvedValue(mockHealthMap),
    };
    balanceService = {
      getAllBalances: jest.fn().mockResolvedValue(mockBalanceMap),
      refreshBalance: jest.fn().mockResolvedValue(mockBalanceMap.twilio),
    };
    configService = {
      getAll: jest.fn().mockReturnValue(mockConfigMap),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlatformHealthController],
      providers: [
        { provide: PlatformHealthService, useValue: healthService },
        { provide: PlatformBalanceService, useValue: balanceService },
        { provide: PlatformServicesConfig, useValue: configService },
      ],
    }).compile();

    controller = module.get(PlatformHealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return health for all 19 platform services', async () => {
    const result = await controller.getHealth();

    expect(result).toHaveProperty('services');
    for (const name of PLATFORM_SERVICE_NAMES) {
      expect(result.services).toHaveProperty(name);
    }
    expect(Object.keys(result.services)).toHaveLength(PLATFORM_SERVICE_NAMES.length);
  });

  it('should include provider, configured, and balance from merged data', async () => {
    const result = await controller.getHealth();

    expect(result.services.weather.provider).toBe('openweather');
    expect(result.services.weather.configured).toBe(true);
    expect(result.services.weather.balance).toBeDefined();
    expect(result.services.anthropic.provider).toBe('Anthropic');
    expect(result.services.anthropic.dashboardUrl).toBe('https://console.anthropic.com');
  });

  it('should merge health data from health service', async () => {
    const result = await controller.getHealth();

    expect(result.services.weather.status).toBe('healthy');
    expect(result.services.weather.avgResponseMs).toBe(120);
    expect(result.services.weather.lastSuccess).toBe('2026-02-24T12:00:00Z');
  });

  it('should include balance data from balance service', async () => {
    const result = await controller.getHealth();

    expect(result.services.twilio.balance.balanceUsd).toBe(142.5);
    expect(result.services.twilio.balance.daysRemaining).toBe(30);
    expect(result.services.twilio.balance.probeStatus).toBe('success');
  });

  it('should override status to not_configured when service is not configured', async () => {
    const result = await controller.getHealth();

    expect(result.services.fuelPrices.configured).toBe(false);
    expect(result.services.fuelPrices.status).toBe('not_configured');
    expect(result.services.mileage.configured).toBe(false);
    expect(result.services.mileage.status).toBe('not_configured');
  });

  it('should preserve non-not_configured statuses for configured services', async () => {
    const result = await controller.getHealth();

    expect(result.services.geocoding.status).toBe('degraded');
    expect(result.services.traffic.status).toBe('down');
    expect(result.services.tolls.status).toBe('healthy');
  });

  it('should call getAllHealth, getAllBalances, and getAll exactly once', async () => {
    await controller.getHealth();

    expect(healthService.getAllHealth).toHaveBeenCalledTimes(1);
    expect(balanceService.getAllBalances).toHaveBeenCalledTimes(1);
    expect(configService.getAll).toHaveBeenCalledTimes(1);
  });

  describe('refreshBalance', () => {
    it('should refresh balance for a valid service', async () => {
      const result = await controller.refreshBalance('twilio');

      expect(balanceService.refreshBalance).toHaveBeenCalledWith('twilio');
      expect(result.balance.balanceUsd).toBe(142.5);
    });

    it('should throw BadRequestException for unknown service', async () => {
      await expect(controller.refreshBalance('nonexistent')).rejects.toThrow('Unknown platform service: nonexistent');
      expect(balanceService.refreshBalance).not.toHaveBeenCalled();
    });
  });
});

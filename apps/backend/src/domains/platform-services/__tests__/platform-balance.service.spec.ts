import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PlatformBalanceService } from '../platform-balance.service';
import { PlatformServicesConfig } from '../platform-services.config';
import { PlatformHealthService } from '../platform-health.service';
import { SallyCacheService } from '../../../infrastructure/cache/sally-cache.service';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('PlatformBalanceService', () => {
  let service: PlatformBalanceService;
  let cache: { get: jest.Mock; set: jest.Mock };
  let configService: { get: jest.Mock };
  let platformConfig: { getAll: jest.Mock };
  let healthService: { recordSuccess: jest.Mock; recordError: jest.Mock };

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
    probeStatus: 'unsupported',
  };

  const mockConfigAll = {
    weather: { provider: 'openweather', configured: true },
    fuelPrices: { provider: 'gasbuddy', configured: false },
    routing: { provider: 'here', configured: true },
    geocoding: { provider: 'here', configured: true },
    mileage: { provider: 'trimble', configured: false },
    traffic: { provider: 'here', configured: true },
    tolls: { provider: 'here', configured: true },
    anthropic: { provider: 'Anthropic', configured: true },
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

  beforeEach(async () => {
    mockFetch.mockReset();
    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    configService = {
      get: jest.fn().mockReturnValue(null),
    };
    platformConfig = {
      getAll: jest.fn().mockReturnValue(mockConfigAll),
    };
    healthService = {
      recordSuccess: jest.fn().mockResolvedValue(undefined),
      recordError: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformBalanceService,
        { provide: SallyCacheService, useValue: cache },
        { provide: ConfigService, useValue: configService },
        { provide: PlatformServicesConfig, useValue: platformConfig },
        { provide: PlatformHealthService, useValue: healthService },
      ],
    }).compile();

    service = module.get(PlatformBalanceService);
  });

  describe('getAllBalances', () => {
    it('should return cached data without fetching when cache hit', async () => {
      const cachedBalance = {
        ...emptyBalance,
        balanceUsd: 50.0,
        probeStatus: 'success',
        lastProbed: '2026-03-25T00:00:00Z',
      };
      // Return cached for twilio, null for everything else
      cache.get.mockImplementation((key: string) =>
        key === 'sally:monitoring:balance:twilio' ? Promise.resolve(cachedBalance) : Promise.resolve(null),
      );

      const result = await service.getAllBalances();

      expect(result.twilio).toEqual(cachedBalance);
      // No fetch should have been called for twilio
      expect(mockFetch).not.toHaveBeenCalledWith(expect.stringContaining('twilio.com'), expect.anything());
    });

    it('should return not_configured for unconfigured services', async () => {
      const result = await service.getAllBalances();

      expect(result.fuelPrices.probeStatus).toBe('not_configured');
      expect(result.livekit.probeStatus).toBe('not_configured');
      expect(result.cartesia.probeStatus).toBe('not_configured');
    });

    it('should return unsupported for mapping services without probes', async () => {
      const result = await service.getAllBalances();

      // Mapping services have no balance probe and no health ping
      expect(result.weather.probeStatus).toBe('unsupported');
    });

    it('should probe and record health for AI/voice/auth services', async () => {
      // Anthropic will fail (no API key in mock) — returns not_configured
      const result = await service.getAllBalances();
      expect(result.anthropic.probeStatus).toBe('not_configured');
      // Firebase Auth returns success (health-only, no external call needed)
      expect(result.firebaseAuth.probeStatus).toBe('success');
    });

    it('should cache results after probing', async () => {
      await service.getAllBalances();

      // Should have called cache.set for each service that was probed
      expect(cache.set).toHaveBeenCalled();
      const setCalls = cache.set.mock.calls;
      // At least one should have been for a balance key
      expect(setCalls.some((c: any[]) => (c[0] as string).startsWith('sally:monitoring:balance:'))).toBe(true);
    });
  });

  describe('refreshBalance', () => {
    it('should force probe and cache result', async () => {
      // Configure Twilio creds
      configService.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'AC_test_sid';
        if (key === 'TWILIO_AUTH_TOKEN') return 'test_token';
        return null;
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ balance: '142.50', currency: 'USD' }),
      });

      const result = await service.refreshBalance('twilio');

      expect(result.balanceUsd).toBe(142.5);
      expect(result.probeStatus).toBe('success');
      expect(cache.set).toHaveBeenCalledWith(
        'sally:monitoring:balance:twilio',
        expect.objectContaining({ balanceUsd: 142.5 }),
        expect.any(Number),
      );
    });
  });

  describe('probeTwilio', () => {
    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'AC_test_sid';
        if (key === 'TWILIO_AUTH_TOKEN') return 'test_token';
        return null;
      });
    });

    it('should return balance from Twilio API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ balance: '87.33', currency: 'USD' }),
      });

      const result = await service.refreshBalance('twilio');

      expect(result.balanceUsd).toBe(87.33);
      expect(result.probeStatus).toBe('success');
      // Should NOT project burn rate or days remaining (review fix)
      expect(result.dailyBurnRateUsd).toBeNull();
      expect(result.daysRemaining).toBeNull();
    });

    it('should return sanitized error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const result = await service.refreshBalance('twilio');

      expect(result.probeStatus).toBe('failed');
      expect(result.probeError).toContain('authentication failed');
      expect(result.probeError).not.toContain('AC_test_sid');
    });

    it('should handle timeout gracefully', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      const result = await service.refreshBalance('twilio');

      expect(result.probeStatus).toBe('failed');
      expect(result.probeError).toContain('timed out');
    });
  });

  describe('probeDeepgram', () => {
    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'DEEPGRAM_API_KEY') return 'dg_test_key';
        return null;
      });
    });

    it('should return credits and cache project ID', async () => {
      // Projects call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          projects: [{ project_id: 'proj_123' }],
        }),
      });
      // Balances call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          balances: [
            { balance_id: 'b1', amount: 50.0, units: 'usd' },
            { balance_id: 'b2', amount: 25.0, units: 'usd' },
          ],
        }),
      });

      const result = await service.refreshBalance('deepgram');

      expect(result.balanceUsd).toBe(75.0);
      expect(result.probeStatus).toBe('success');
      // Project ID should have been cached
      expect(cache.set).toHaveBeenCalledWith('sally:monitoring:deepgram:project_id', 'proj_123', 3_600_000);
    });

    it('should return failed when no Deepgram project found', async () => {
      // Projects call returns empty array
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ projects: [] }),
      });

      const result = await service.refreshBalance('deepgram');

      expect(result.probeStatus).toBe('failed');
      expect(result.probeError).toContain('No Deepgram project found');
    });

    it('should handle Deepgram projects API error', async () => {
      // Projects call fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await service.refreshBalance('deepgram');
      expect(result.probeStatus).toBe('failed');
    });

    it('should handle Deepgram balances API error', async () => {
      // Projects call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          projects: [{ project_id: 'proj_123' }],
        }),
      });
      // Balances call fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const result = await service.refreshBalance('deepgram');
      expect(result.probeStatus).toBe('failed');
    });

    it('should use cached project ID on subsequent calls', async () => {
      cache.get.mockImplementation((key: string) =>
        key === 'sally:monitoring:deepgram:project_id' ? Promise.resolve('proj_cached') : Promise.resolve(null),
      );

      // Only balances call (no projects call needed)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          balances: [{ balance_id: 'b1', amount: 30.0, units: 'usd' }],
        }),
      });

      const result = await service.refreshBalance('deepgram');

      expect(result.balanceUsd).toBe(30.0);
      // Should have only made 1 fetch call (balances), not 2
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.deepgram.com/v1/projects/proj_cached/balances',
        expect.anything(),
      );
    });
  });

  describe('probeOpenAI', () => {
    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'sk_test_key';
        return null;
      });
    });

    it('should return monthly spend from costs API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              results: [{ amount: { value: 1500 } }, { amount: { value: 500 } }],
            },
          ],
        }),
      });

      const result = await service.refreshBalance('openai');

      expect(result.monthlySpendUsd).toBe(20.0); // (1500 + 500) / 100
      expect(result.probeStatus).toBe('success');
    });

    it('should handle OpenAI costs API non-auth error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await service.refreshBalance('openai');
      expect(result.probeStatus).toBe('failed');
    });

    it('should return unsupported when key lacks billing permissions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      const result = await service.refreshBalance('openai');

      expect(result.probeStatus).toBe('unsupported');
      expect(result.planTier).toContain('billing permissions');
    });
  });

  describe('probeResend', () => {
    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'RESEND_API_KEY') return 're_test_key';
        return null;
      });
    });

    it('should handle Resend API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await service.refreshBalance('resend');
      expect(result.probeStatus).toBe('failed');
    });

    it('should verify API key works', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
        headers: new Map(),
      });

      const result = await service.refreshBalance('resend');

      expect(result.probeStatus).toBe('success');
      expect(result.planTier).toBe('Resend');
    });
  });

  describe('probeAnthropic', () => {
    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'anthropicApiKey') return 'sk-ant-test';
        return null;
      });
    });

    it('should return success when Anthropic API responds ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await service.refreshBalance('anthropic');

      expect(result.probeStatus).toBe('success');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'sk-ant-test',
          }),
        }),
      );
    });

    it('should fail when Anthropic API returns error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

      const result = await service.refreshBalance('anthropic');
      expect(result.probeStatus).toBe('failed');
    });
  });

  describe('probeLangfuse', () => {
    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'LANGFUSE_BASE_URL') return 'https://langfuse.test.com';
        if (key === 'LANGFUSE_PUBLIC_KEY') return 'pk-test';
        return null;
      });
    });

    it('should return success when Langfuse health endpoint responds ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await service.refreshBalance('langfuse');

      expect(result.probeStatus).toBe('success');
      expect(mockFetch).toHaveBeenCalledWith('https://langfuse.test.com/api/public/health', expect.anything());
    });
  });

  describe('probeLiveKit', () => {
    beforeEach(() => {
      // Override config to mark livekit as configured
      platformConfig.getAll.mockReturnValue({
        ...mockConfigAll,
        livekit: { provider: 'LiveKit', configured: true },
      });
      configService.get.mockImplementation((key: string) => {
        if (key === 'LIVEKIT_URL') return 'wss://livekit.test.com';
        if (key === 'LIVEKIT_API_KEY') return 'lk-key';
        if (key === 'LIVEKIT_API_SECRET') return 'lk-secret';
        return null;
      });
    });

    it('should convert wss:// to https:// for health check', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const result = await service.refreshBalance('livekit');

      expect(result.probeStatus).toBe('success');
      expect(mockFetch).toHaveBeenCalledWith('https://livekit.test.com', expect.objectContaining({ method: 'HEAD' }));
    });

    it('should fail when LiveKit returns 500+', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

      const result = await service.refreshBalance('livekit');
      expect(result.probeStatus).toBe('failed');
    });
  });

  describe('probeCartesia', () => {
    beforeEach(() => {
      // Override config to mark cartesia as configured
      platformConfig.getAll.mockReturnValue({
        ...mockConfigAll,
        cartesia: { provider: 'Cartesia', configured: true },
      });
      configService.get.mockImplementation((key: string) => {
        if (key === 'CARTESIA_API_KEY') return 'cartesia-key';
        return null;
      });
    });

    it('should return success when Cartesia API responds ok', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await service.refreshBalance('cartesia');

      expect(result.probeStatus).toBe('success');
    });
  });

  describe('probeS3', () => {
    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        if (key === 's3.bucket') return 'sally-bucket';
        if (key === 's3.region') return 'us-west-2';
        return null;
      });
    });

    it('should succeed when S3 bucket is reachable (403 = valid private bucket)', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });

      const result = await service.refreshBalance('s3');

      expect(result.probeStatus).toBe('success');
      expect(mockFetch).toHaveBeenCalledWith('https://sally-bucket.s3.us-west-2.amazonaws.com/', expect.anything());
    });

    it('should fail when S3 bucket returns 404', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const result = await service.refreshBalance('s3');
      expect(result.probeStatus).toBe('failed');
    });
  });

  describe('unsupported services', () => {
    it('should return unsupported for unknown service names', async () => {
      // Use a default case by setting up config with an unknown service
      platformConfig.getAll.mockReturnValue({
        ...mockConfigAll,
        unknownService: { provider: 'unknown', configured: true },
      });

      const result = await service.getAllBalances();
      // unknownService should get 'unsupported' probe status
      expect(result).toHaveProperty('unknownService');
    });
  });

  describe('health-only probes', () => {
    it('should return success for firebaseAuth', async () => {
      const result = await service.refreshBalance('firebaseAuth');

      expect(result.probeStatus).toBe('success');
      expect(result.planTier).toContain('Firebase');
    });

    it('should return success for turnstile', async () => {
      const result = await service.refreshBalance('turnstile');

      expect(result.probeStatus).toBe('success');
      expect(result.planTier).toContain('Turnstile');
    });

    it('should return success for aiGateway', async () => {
      const result = await service.refreshBalance('aiGateway');

      expect(result.probeStatus).toBe('success');
      expect(result.planTier).toContain('AI Gateway');
    });
  });

  describe('error sanitization', () => {
    it('should sanitize 429 rate limit errors', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'AC_test';
        if (key === 'TWILIO_AUTH_TOKEN') return 'token';
        return null;
      });

      mockFetch.mockRejectedValueOnce(new Error('Twilio API returned 429'));

      const result = await service.refreshBalance('twilio');
      expect(result.probeError).toContain('rate limited');
    });

    it('should sanitize 500+ server errors', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'AC_test';
        if (key === 'TWILIO_AUTH_TOKEN') return 'token';
        return null;
      });

      mockFetch.mockRejectedValueOnce(new Error('Twilio API returned 503'));

      const result = await service.refreshBalance('twilio');
      expect(result.probeError).toContain('provider error');
    });

    it('should sanitize generic HTTP errors', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'AC_test';
        if (key === 'TWILIO_AUTH_TOKEN') return 'token';
        return null;
      });

      mockFetch.mockRejectedValueOnce(new Error('API returned 404'));

      const result = await service.refreshBalance('twilio');
      expect(result.probeError).toContain('API error');
    });

    it('should not leak raw error details to probeError', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'AC_secret_sid_12345';
        if (key === 'TWILIO_AUTH_TOKEN') return 'secret_token_67890';
        return null;
      });

      mockFetch.mockRejectedValueOnce(
        new Error('Connection refused to internal-host:5432 with sid AC_secret_sid_12345'),
      );

      const result = await service.refreshBalance('twilio');

      expect(result.probeStatus).toBe('failed');
      // Should NOT contain the raw error with internal details
      expect(result.probeError).not.toContain('internal-host');
      expect(result.probeError).not.toContain('AC_secret_sid');
      expect(result.probeError).toContain('check server logs');
    });
  });
});

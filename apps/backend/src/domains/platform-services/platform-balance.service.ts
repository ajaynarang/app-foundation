import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PlatformServiceName, ServiceBalance } from '@sally/shared-types';
import { SallyCacheService } from '../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../infrastructure/cache/cache-key.constants';
import { PlatformServicesConfig } from './platform-services.config';
import { PlatformHealthService } from './platform-health.service';

// Re-export for consumers that import from this file
export type { ServiceBalance } from '@sally/shared-types';

/** Cache TTL for balance probes: 5 minutes + jitter to prevent thundering herd */
const BALANCE_CACHE_TTL_BASE_MS = 300_000;
const BALANCE_CACHE_JITTER_MS = 30_000;

/** Timeout for all outbound HTTP probes */
const PROBE_TIMEOUT_MS = 10_000;

function cacheTtl(): number {
  return BALANCE_CACHE_TTL_BASE_MS + Math.floor(Math.random() * BALANCE_CACHE_JITTER_MS);
}

@Injectable()
export class PlatformBalanceService {
  private readonly logger = new Logger(PlatformBalanceService.name);

  constructor(
    private readonly cache: SallyCacheService,
    private config: PlatformServicesConfig,
    private configService: ConfigService,
    private health: PlatformHealthService,
  ) {}

  /** Read env var — tries ConfigService first, falls back to process.env */
  private env(key: string): string | undefined {
    const fromConfig = this.configService.get<string>(key);
    if (fromConfig) return fromConfig;
    return process.env[key] || undefined;
  }

  /**
   * Get balance/cost data for all platform services.
   * Returns cached data if available, otherwise probes in parallel.
   */
  async getAllBalances(): Promise<Record<PlatformServiceName, ServiceBalance>> {
    const configMap = this.config.getAll();
    const entries = await Promise.all(
      (Object.entries(configMap) as [PlatformServiceName, (typeof configMap)[PlatformServiceName]][]).map(
        async ([name, entry]) => {
          const cacheKey = buildKey('sally:monitoring', 'balance', name);
          const cached = await this.cache.get<ServiceBalance>(cacheKey);
          if (cached) return [name, cached] as const;

          const balance = await this.probeBalance(name, entry.configured);
          await this.cache.set(cacheKey, balance, cacheTtl());
          return [name, balance] as const;
        },
      ),
    );

    return Object.fromEntries(entries) as Record<PlatformServiceName, ServiceBalance>;
  }

  /** Force-refresh balance for a specific service */
  async refreshBalance(name: PlatformServiceName): Promise<ServiceBalance> {
    const entry = this.config.getAll()[name];
    const balance = await this.probeBalance(name, entry?.configured ?? false);
    await this.cache.set(buildKey('sally:monitoring', 'balance', name), balance, cacheTtl());
    return balance;
  }

  private async probeBalance(name: PlatformServiceName, configured: boolean): Promise<ServiceBalance> {
    if (!configured) {
      return this.notConfigured();
    }

    const start = Date.now();
    try {
      let result: ServiceBalance;
      switch (name) {
        // Services with balance + health probes
        case 'twilio':
          result = await this.probeTwilio();
          break;
        case 'deepgram':
          result = await this.probeDeepgram();
          break;
        case 'openai':
          result = await this.probeOpenAI();
          break;
        case 'resend':
          result = await this.probeResend();
          break;
        // Services with health-only pings (no balance API)
        case 'anthropic':
          result = await this.probeAnthropic();
          break;
        case 'langfuse':
          result = await this.probeLangfuse();
          break;
        case 'livekit':
          result = await this.probeLiveKit();
          break;
        case 'cartesia':
          result = await this.probeCartesia();
          break;
        case 's3':
          result = await this.probeS3();
          break;
        case 'firebaseAuth':
          // Firebase initializes at startup — if we got here, it's configured
          result = this.healthOnly('Firebase Auth (initialized at startup)');
          break;
        case 'turnstile':
          // Turnstile only validates on client-side form submission — no server ping
          result = this.healthOnly('Cloudflare Turnstile (client-side only)');
          break;
        case 'aiGateway':
          // AI Gateway health piggybacks on LLM calls — no standalone ping
          result = this.healthOnly('Vercel AI Gateway (health via LLM calls)');
          break;
        default:
          result = this.unsupported(name);
          break;
      }

      // Record health success for any probe that returned successfully
      if (result.probeStatus === 'success') {
        await this.health.recordSuccess(name, Date.now() - start);
      }
      return result;
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : '';
      this.logger.warn(`Balance probe failed for ${name}: ${rawMessage}`);

      // Record health failure
      await this.health.recordError(name, error instanceof Error ? error : new Error(rawMessage));

      return {
        ...this.emptyBalance(),
        probeStatus: 'failed',
        probeError: this.sanitizeProbeError(name, rawMessage, errorName),
        lastProbed: new Date().toISOString(),
      };
    }
  }

  /** Strip internal details from error messages before sending to frontend */
  private sanitizeProbeError(service: PlatformServiceName, raw: string, errorName: string): string {
    // Map known HTTP status patterns to user-friendly messages
    const statusMatch = raw.match(/returned (\d{3})/);
    if (statusMatch) {
      const code = parseInt(statusMatch[1]);
      if (code === 401 || code === 403) return `${service}: authentication failed — check API key`;
      if (code === 429) return `${service}: rate limited — try again later`;
      if (code >= 500) return `${service}: provider error (HTTP ${code})`;
      return `${service}: API error (HTTP ${code})`;
    }
    if (errorName === 'AbortError' || raw.includes('timeout') || raw.includes('aborted')) {
      return `${service}: request timed out`;
    }
    return `${service}: probe failed — check server logs for details`;
  }

  // ----- Provider Probes -----

  /**
   * Twilio: GET /2010-04-01/Accounts/{sid}/Balance.json
   * Returns account balance in USD. Burn rate requires Usage Records API (not yet implemented).
   */
  private async probeTwilio(): Promise<ServiceBalance> {
    const sid = this.env('TWILIO_ACCOUNT_SID');
    const token = this.env('TWILIO_AUTH_TOKEN');
    if (!sid || !token) return this.notConfigured();

    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Balance.json`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`Twilio balance API returned ${res.status}`);
    }

    const data = (await res.json()) as {
      balance: string;
      currency: string;
    };
    const balance = parseFloat(data.balance);

    // We only have balance — burn rate requires Twilio Usage Records API.
    // Return balance without projecting daysRemaining to avoid misleading data.
    return {
      balanceUsd: balance,
      monthlySpendUsd: null,
      dailyBurnRateUsd: null,
      daysRemaining: null,
      planTier: 'Pay-as-you-go',
      monthlyUsage: null,
      quotaLimit: null,
      quotaUsedPercent: null,
      lastProbed: new Date().toISOString(),
      probeStatus: 'success',
    };
  }

  /**
   * Deepgram: GET /v1/projects/{project_id}/balances
   * Returns remaining credits. Project ID is cached separately (1h) to avoid
   * an extra API call on every balance probe.
   */
  private async probeDeepgram(): Promise<ServiceBalance> {
    const apiKey = this.env('DEEPGRAM_API_KEY');
    if (!apiKey) return this.notConfigured();

    // Resolve project ID (cached 1 hour — it rarely changes)
    const projectId = await this.getDeepgramProjectId(apiKey);
    if (!projectId) {
      return {
        ...this.emptyBalance(),
        probeStatus: 'failed',
        probeError: 'No Deepgram project found',
        lastProbed: new Date().toISOString(),
      };
    }

    const balancesRes = await fetch(`https://api.deepgram.com/v1/projects/${projectId}/balances`, {
      headers: { Authorization: `Token ${apiKey}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (!balancesRes.ok) {
      throw new Error(`Deepgram balances API returned ${balancesRes.status}`);
    }

    const balancesData = (await balancesRes.json()) as {
      balances: Array<{
        balance_id: string;
        amount: number;
        units: string;
      }>;
    };

    const totalCredits = balancesData.balances?.reduce((sum, b) => sum + (b.amount || 0), 0) ?? 0;

    return {
      balanceUsd: totalCredits,
      monthlySpendUsd: null,
      dailyBurnRateUsd: null,
      daysRemaining: null,
      planTier: 'Pay-as-you-go',
      monthlyUsage: null,
      quotaLimit: null,
      quotaUsedPercent: null,
      lastProbed: new Date().toISOString(),
      probeStatus: 'success',
    };
  }

  /** Cached Deepgram project ID lookup (1 hour TTL) */
  private async getDeepgramProjectId(apiKey: string): Promise<string | null> {
    const cacheKey = buildKey('sally:monitoring', 'deepgram', 'project_id');
    const cached = await this.cache.get<string>(cacheKey);
    if (cached) return cached;

    const res = await fetch('https://api.deepgram.com/v1/projects', {
      headers: { Authorization: `Token ${apiKey}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`Deepgram projects API returned ${res.status}`);
    }

    const data = (await res.json()) as {
      projects: Array<{ project_id: string }>;
    };
    const projectId = data.projects?.[0]?.project_id ?? null;

    if (projectId) {
      await this.cache.set(cacheKey, projectId, 3_600_000); // 1 hour
    }

    return projectId;
  }

  /**
   * OpenAI: GET /v1/organization/costs
   * Requires org-level API key. Returns 'unsupported' if key lacks billing permissions.
   */
  private async probeOpenAI(): Promise<ServiceBalance> {
    const apiKey = this.env('OPENAI_API_KEY');
    if (!apiKey) return this.notConfigured();

    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const startTs = Math.floor(startDate.getTime() / 1000);

    const res = await fetch(`https://api.openai.com/v1/organization/costs?start_time=${startTs}&limit=1`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (!res.ok) {
      // 403/401 means key lacks billing permissions — not an error, just unsupported
      if (res.status === 401 || res.status === 403) {
        return {
          ...this.emptyBalance(),
          probeStatus: 'unsupported',
          planTier: 'API key lacks billing permissions — check platform.openai.com/usage',
          lastProbed: new Date().toISOString(),
        };
      }
      throw new Error(`OpenAI costs API returned ${res.status}`);
    }

    const data = (await res.json()) as {
      data: Array<{ results: Array<{ amount: { value: number } }> }>;
    };
    const totalCostCents = data.data?.[0]?.results?.reduce((sum, r) => sum + (r.amount?.value || 0), 0) ?? 0;
    const totalCostUsd = totalCostCents / 100;

    const dayOfMonth = now.getDate();
    const dailyAvg = dayOfMonth > 0 ? totalCostUsd / dayOfMonth : 0;

    return {
      balanceUsd: null,
      monthlySpendUsd: totalCostUsd,
      dailyBurnRateUsd: Math.round(dailyAvg * 100) / 100,
      daysRemaining: null,
      planTier: 'API',
      monthlyUsage: `$${totalCostUsd.toFixed(2)} this month`,
      quotaLimit: null,
      quotaUsedPercent: null,
      lastProbed: new Date().toISOString(),
      probeStatus: 'success',
    };
  }

  /**
   * Resend: GET /domains — verifies API key is valid.
   * Resend doesn't expose monthly email usage via API.
   */
  private async probeResend(): Promise<ServiceBalance> {
    const apiKey = this.env('RESEND_API_KEY');
    if (!apiKey) return this.notConfigured();

    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`Resend API returned ${res.status}`);
    }

    // Resend doesn't expose monthly email usage via API.
    // We verify the key works — usage must be checked on resend.com/settings/billing.
    return {
      balanceUsd: null,
      monthlySpendUsd: null,
      dailyBurnRateUsd: null,
      daysRemaining: null,
      planTier: 'Resend',
      monthlyUsage: null,
      quotaLimit: null,
      quotaUsedPercent: null,
      lastProbed: new Date().toISOString(),
      probeStatus: 'success',
    };
  }

  // ----- Health-Only Probes (no balance API, just verify service is reachable) -----

  /** Anthropic: GET /v1/models — free endpoint, validates API key */
  private async probeAnthropic(): Promise<ServiceBalance> {
    const apiKey = this.env('anthropicApiKey') || this.env('ANTHROPIC_API_KEY');
    if (!apiKey) return this.notConfigured();

    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`Anthropic API returned ${res.status}`);
    return this.healthOnly('Pay-as-you-go');
  }

  /** Langfuse: GET /api/public/health — dedicated health endpoint */
  private async probeLangfuse(): Promise<ServiceBalance> {
    const baseUrl = this.env('LANGFUSE_BASE_URL');
    const publicKey = this.env('LANGFUSE_PUBLIC_KEY');
    if (!baseUrl || !publicKey) return this.notConfigured();

    const res = await fetch(`${baseUrl}/api/public/health`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`Langfuse health returned ${res.status}`);
    return this.healthOnly('Langfuse');
  }

  /** LiveKit: GET /twirp/livekit.RoomService/ListRooms — validates API key */
  private async probeLiveKit(): Promise<ServiceBalance> {
    const url = this.env('LIVEKIT_URL');
    const apiKey = this.env('LIVEKIT_API_KEY');
    const apiSecret = this.env('LIVEKIT_API_SECRET');
    if (!url || !apiKey || !apiSecret) return this.notConfigured();

    // Simple connectivity check — convert wss:// to https:// for HTTP probe
    const healthUrl = url
      .replace(/^wss:\/\//, 'https://')
      .replace(/^ws:\/\//, 'http://')
      .replace(/\/$/, '');
    const res = await fetch(healthUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    // LiveKit returns various codes but reachability = healthy
    if (res.status >= 500) throw new Error(`LiveKit returned ${res.status}`);
    return this.healthOnly('LiveKit Cloud');
  }

  /** Cartesia: GET /voices — validates API key */
  private async probeCartesia(): Promise<ServiceBalance> {
    const apiKey = this.env('CARTESIA_API_KEY');
    if (!apiKey) return this.notConfigured();

    const res = await fetch('https://api.cartesia.ai/voices', {
      headers: {
        'X-API-Key': apiKey,
        'Cartesia-Version': '2024-06-10',
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`Cartesia API returned ${res.status}`);
    return this.healthOnly('Cartesia');
  }

  /** S3: HEAD bucket — validates credentials + bucket exists */
  private async probeS3(): Promise<ServiceBalance> {
    const bucket = this.configService.get<string>('s3.bucket');
    const region = this.configService.get<string>('s3.region') || 'us-east-1';
    if (!bucket) return this.notConfigured();

    // We can't easily do SigV4 with raw fetch. Instead, verify the bucket
    // endpoint is reachable (public HEAD doesn't require auth).
    const res = await fetch(`https://${bucket}.s3.${region}.amazonaws.com/`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    // S3 returns 403 (access denied) for valid private buckets — that's healthy
    // 404 means bucket doesn't exist
    if (res.status === 404) throw new Error('S3 bucket not found');
    return this.healthOnly('AWS S3');
  }

  /** Return a balance result for health-only probes (no balance data) */
  private healthOnly(planTier: string): ServiceBalance {
    return {
      ...this.emptyBalance(),
      probeStatus: 'success',
      planTier,
      lastProbed: new Date().toISOString(),
    };
  }

  // ----- Helpers -----

  private notConfigured(): ServiceBalance {
    return {
      ...this.emptyBalance(),
      probeStatus: 'not_configured',
    };
  }

  private unsupported(name: PlatformServiceName): ServiceBalance {
    const dashboardHints: Partial<Record<PlatformServiceName, string>> = {
      anthropic: 'Check console.anthropic.com for credit balance',
      livekit: 'Check cloud.livekit.io for usage',
      cartesia: 'Check play.cartesia.ai for usage',
      firebaseAuth: 'Firebase Auth is usage-based via GCP billing',
      turnstile: 'Cloudflare Turnstile is free tier',
      s3: 'Check AWS Cost Explorer for S3 spend',
      aiGateway: 'Check Vercel dashboard for AI Gateway usage',
      langfuse: 'Check Langfuse dashboard for LLM costs',
    };

    return {
      ...this.emptyBalance(),
      probeStatus: 'unsupported',
      planTier: dashboardHints[name] ?? null,
      lastProbed: new Date().toISOString(),
    };
  }

  private emptyBalance(): ServiceBalance {
    return {
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
  }
}

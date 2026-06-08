import { Injectable, Logger } from '@nestjs/common';
import { SallyCacheService } from '../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../infrastructure/cache/cache-key.constants';
import { PlatformServiceName, PLATFORM_SERVICE_NAMES } from './platform-services.config';
import { CACHE_TTL_FROZEN_24H } from '../../constants/cache.constants';

export interface ServiceHealth {
  provider: string;
  configured: boolean;
  status: 'healthy' | 'degraded' | 'down' | 'not_configured';
  lastSuccess?: string;
  lastError?: string;
  lastErrorMessage?: string;
  avgResponseMs?: number;
  errorCount24h?: number;
}

/** 24 hours in seconds — matches CACHE_TTL_FROZEN_24H for the 24h error window. */
const ERROR_COUNT_WINDOW_SECONDS = 86_400;

@Injectable()
export class PlatformHealthService {
  private readonly logger = new Logger(PlatformHealthService.name);

  constructor(private readonly cache: SallyCacheService) {}

  async recordSuccess(service: PlatformServiceName, responseMs: number): Promise<void> {
    const lastSuccessKey = buildKey('sally:health', service, 'last_success');
    const avgMsKey = buildKey('sally:health', service, 'avg_response_ms');

    await Promise.all([
      this.cache.set(lastSuccessKey, new Date().toISOString(), CACHE_TTL_FROZEN_24H),
      (async () => {
        const currentAvg = (await this.cache.get<number>(avgMsKey)) ?? responseMs;
        const newAvg = Math.round(currentAvg * 0.9 + responseMs * 0.1);
        await this.cache.set(avgMsKey, newAvg, CACHE_TTL_FROZEN_24H);
      })(),
    ]);
  }

  async recordError(service: PlatformServiceName, error: Error): Promise<void> {
    const lastErrorKey = buildKey('sally:health', service, 'last_error');
    const lastErrorMsgKey = buildKey('sally:health', service, 'last_error_msg');
    const countKey = buildKey('sally:health', service, 'error_count_24h');

    await Promise.all([
      this.cache.set(lastErrorKey, new Date().toISOString(), CACHE_TTL_FROZEN_24H),
      this.cache.set(lastErrorMsgKey, error.message, CACHE_TTL_FROZEN_24H),
      // Atomic INCRBY + first-touch EXPIRE — no read-modify-write race.
      this.cache.increment(countKey, 1, ERROR_COUNT_WINDOW_SECONDS),
    ]);
  }

  /**
   * Execute an async operation with automatic health tracking.
   *
   * Records success (with latency) or error against the given service name,
   * then returns the result or re-throws the error.
   *
   * Usage:
   *   return this.health.withHealthTracking('weather', () =>
   *     this.provider.getCurrentWeather(lat, lng),
   *   );
   */
  async withHealthTracking<T>(service: PlatformServiceName, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      await this.recordSuccess(service, Date.now() - start);
      return result;
    } catch (error) {
      await this.recordError(service, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async getHealth(service: PlatformServiceName): Promise<Omit<ServiceHealth, 'provider' | 'configured'>> {
    const [lastSuccess, lastError, lastErrorMsg, avgMs, errorCount] = await Promise.all([
      this.cache.get<string>(buildKey('sally:health', service, 'last_success')),
      this.cache.get<string>(buildKey('sally:health', service, 'last_error')),
      this.cache.get<string>(buildKey('sally:health', service, 'last_error_msg')),
      this.cache.get<number>(buildKey('sally:health', service, 'avg_response_ms')),
      this.cache.get<number>(buildKey('sally:health', service, 'error_count_24h')),
    ]);

    let status: ServiceHealth['status'] = 'healthy';
    if (!lastSuccess && !lastError) status = 'not_configured';
    else if (lastError && (!lastSuccess || lastError > lastSuccess)) status = 'down';
    else if ((errorCount ?? 0) > 10) status = 'degraded';

    return {
      status,
      lastSuccess: lastSuccess ?? undefined,
      lastError: lastError ?? undefined,
      lastErrorMessage: lastErrorMsg ?? undefined,
      avgResponseMs: avgMs ?? undefined,
      errorCount24h: errorCount ?? undefined,
    };
  }

  async getAllHealth(): Promise<Record<PlatformServiceName, Omit<ServiceHealth, 'provider' | 'configured'>>> {
    const entries = await Promise.all(
      PLATFORM_SERVICE_NAMES.map(async (name) => [name, await this.getHealth(name)] as const),
    );
    return Object.fromEntries(entries) as Record<PlatformServiceName, Omit<ServiceHealth, 'provider' | 'configured'>>;
  }
}

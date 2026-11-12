import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmbeddingModel, LanguageModel } from 'ai';
import type { ModelAlias } from '@app/shared-types';

import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { AppCacheService } from '@appshore/platform/infrastructure/cache/app-cache.service';
import { buildKey } from '@appshore/kernel/infrastructure/cache/cache-key.constants';
import { CACHE_TTL_HOT_60S } from '@appshore/kernel/constants/cache.constants';
import { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { getEnvType } from '@appshore/kernel/shared/utils/env-type';
import { DOMAIN_EVENTS } from '../../../platform-glue/events/domain-events.constants';

import { AiNotConfigured } from './ai-not-configured.error';
import { ZeroRetentionUnavailable } from '../infrastructure/redaction/zero-retention-unavailable.error';
import { MODEL_CATALOG } from './model-catalog';
import { tunedLanguageModel } from './model-tuning.middleware';
import { PLATFORM_ROUTES, type PlatformRoute, type PlatformRouteConfig } from './route-registry';
import { AI_NEEDS, type AiNeed, type AiPayer, type ProviderBundle, type ResolvedRoute } from './routing.types';
import type { RetentionClass } from './routing.types';

interface Candidate {
  routeId: string;
  credentialType: string;
  payer: AiPayer;
  retention: RetentionClass;
  /** Key of the built bundle in the in-process cache. */
  cacheKey: string;
  /** When set, stale bundles sharing this prefix are evicted on rebuild, so an old secret does not linger. */
  evictPrefix?: string;
  build: () => ProviderBundle;
}

export interface CandidatePools {
  payer: AiPayer;
  candidates: Candidate[];
  /** True when a route serving the need existed but the retention policy filtered it out. */
  hadRetentionInert: boolean;
}

/** The cache key of a tenant's retention policy. Whatever changes `Tenant.aiZeroRetention` deletes it after commit. */
export function retentionPolicyCacheKey(tenantId: number): string {
  return buildKey('app:ai-routing', 'zdr', tenantId);
}

/** `ENV_TYPE=production` and nothing else; an unset `ENV_TYPE` (a unit test, a script) is not production. */
function isProductionEnvType(): boolean {
  try {
    return getEnvType() === 'production';
  } catch {
    return false;
  }
}

/**
 * AiRouteResolver: the one way to get a model. Retention is a tenant property, so provider choice is too: `resolve`
 * reads the tenant's policy, builds a single-payer candidate pool for the need, and fails CLOSED with a typed error
 * when nothing compatible exists. There is deliberately no other way to obtain a provider.
 *
 * - `AiNotConfigured` (503): nothing serves the need at all. A keyless developer machine lands here.
 * - `ZeroRetentionUnavailable` (400, and the `AI_ZERO_RETENTION_UNAVAILABLE` signal): a route serves the need, but the
 *   tenant requires zero data retention and the route keeps data. Never downgraded to a retaining route.
 *
 * This is the platform pool only: `platform-openrouter` (language) and `platform-cohere` (embeddings), both standard
 * retention. Workspace credentials (bring-your-own-key, with their `AiCredentialFailing` payer boundary), the
 * zero-retention platform route and per-workspace sub-keys each add a pool or an entry without reshaping this class.
 */
@Injectable()
export class AiRouteResolver {
  private readonly logger = new Logger(AiRouteResolver.name);
  private readonly providerCache = new Map<string, ProviderBundle>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
    /**
     * Signal only: the zero-retention refusal has no write behind it and is raised on the call path
     * (`no-direct-emit.allowlist.json`).
     */
    private readonly events: DomainEventService,
    private readonly config: ConfigService,
  ) {}

  async resolve(tenantId: number, need: AiNeed): Promise<ResolvedRoute> {
    const policy = await this.retentionPolicy(tenantId);
    const first = this.firstOrThrow(tenantId, need, policy, await this.candidatePools(tenantId, need, policy));
    return this.materialize(first, policy);
  }

  /**
   * Platform-owned content with no tenant to route by (the global knowledge base). Platform pool only, standard
   * policy. Never use it for tenant content.
   */
  resolvePlatform(need: AiNeed): ResolvedRoute {
    const config = this.platformConfig();
    const route = PLATFORM_ROUTES.find((r) => r.serves.includes(need) && r.isConfigured(config));
    if (!route) throw this.notConfigured(need);
    return this.materialize(this.platformCandidate(route, config), 'STANDARD');
  }

  /** The single-payer pool `resolve` picks from. `policyIn` defaults to the tenant's stored policy. */
  async candidatePools(tenantId: number, need: AiNeed, policyIn?: RetentionClass): Promise<CandidatePools> {
    const policy = policyIn ?? (await this.retentionPolicy(tenantId));
    const config = this.platformConfig();
    const platformServing = PLATFORM_ROUTES.filter((r) => r.serves.includes(need) && r.isConfigured(config));
    const platformCompatible = platformServing.filter((r) => policy === 'STANDARD' || r.retention === 'ZDR');
    return {
      payer: 'PLATFORM',
      candidates: platformCompatible.map((r) => this.platformCandidate(r, config)),
      hadRetentionInert: platformServing.length > platformCompatible.length,
    };
  }

  /** True when the tenant's standing policy is zero data retention (cached hot). */
  async isZeroRetention(tenantId: number): Promise<boolean> {
    return (await this.retentionPolicy(tenantId)) === 'ZDR';
  }

  /** For each need, the platform route that serves it right now, or `none`. */
  describePlatformRoutes(): Record<AiNeed, string> {
    const config = this.platformConfig();
    const out = {} as Record<AiNeed, string>;
    for (const need of AI_NEEDS) {
      out[need] = PLATFORM_ROUTES.find((r) => r.serves.includes(need) && r.isConfigured(config))?.routeId ?? 'none';
    }
    return out;
  }

  /**
   * One boot line per need. A missing platform key never stops the app; in production a need with no route is
   * logged at warn level.
   */
  logPlatformRoutes(): void {
    const production = isProductionEnvType();
    for (const [need, routeId] of Object.entries(this.describePlatformRoutes())) {
      const line = `${need}: ${routeId}`;
      if (routeId === 'none' && production) this.logger.warn(line);
      else this.logger.log(line);
    }
  }

  /** The pool's first candidate, or the typed fail-closed error (a retention block also raises its signal). */
  private firstOrThrow(tenantId: number, need: AiNeed, policy: RetentionClass, pools: CandidatePools): Candidate {
    const first = pools.candidates[0];
    if (first) return first;
    if (policy === 'ZDR' && pools.hadRetentionInert) {
      void this.events
        .emit(DOMAIN_EVENTS.AI_ZERO_RETENTION_UNAVAILABLE, tenantId, { need })
        .catch((e: Error) => this.logger.warn(`zero-retention-unavailable signal failed: ${e.message}`));
      throw new ZeroRetentionUnavailable(need);
    }
    throw this.notConfigured(need);
  }

  private notConfigured(need: AiNeed): AiNotConfigured {
    if (isProductionEnvType()) this.logger.error(`No AI route serves "${need}" on this deployment`);
    return new AiNotConfigured(need);
  }

  private platformCandidate(route: PlatformRoute, config: PlatformRouteConfig): Candidate {
    return {
      routeId: route.routeId,
      credentialType: route.credentialType,
      payer: 'PLATFORM',
      retention: route.retention,
      cacheKey: `platform:${route.routeId}`,
      build: () => route.buildProvider(config),
    };
  }

  private materialize(candidate: Candidate, policy: RetentionClass): ResolvedRoute {
    let bundle = this.providerCache.get(candidate.cacheKey);
    if (!bundle) {
      if (candidate.evictPrefix) {
        for (const key of this.providerCache.keys()) {
          if (key.startsWith(candidate.evictPrefix)) this.providerCache.delete(key);
        }
      }
      bundle = candidate.build();
      this.providerCache.set(candidate.cacheKey, bundle);
    }
    const resolved = bundle;
    return {
      routeId: candidate.routeId,
      credentialType: candidate.credentialType,
      payer: candidate.payer,
      retention: candidate.retention,
      providerLabel: resolved.providerLabel,
      languageModel: (alias: ModelAlias): LanguageModel => {
        if (policy === 'ZDR' && !MODEL_CATALOG[alias].zdrCapable) throw new ZeroRetentionUnavailable(alias);
        const base = resolved.languageModel;
        if (!base) throw new AiNotConfigured('language');
        // The tuning is the resolver's, applied per route: effort in the route family's shape, and one retry of a
        // refused generate call on the next alias up, on the same route.
        return tunedLanguageModel(base, alias, resolved.effortFamily ?? 'anthropic');
      },
      modelIdFor: (alias: ModelAlias): string => {
        if (!resolved.modelIdFor) throw new AiNotConfigured('language');
        return resolved.modelIdFor(alias);
      },
      ledgerModelIdFor: (alias: ModelAlias, answeredByModelId?: string): string => {
        if (!resolved.ledgerModelIdFor) throw new AiNotConfigured('language');
        return resolved.ledgerModelIdFor(alias, answeredByModelId);
      },
      embeddingModel: (): EmbeddingModel => {
        if (!resolved.embeddingModel) throw new AiNotConfigured('embedding');
        return resolved.embeddingModel();
      },
      embeddingModelId: (): string => {
        if (!resolved.embeddingModelId) throw new AiNotConfigured('embedding');
        return resolved.embeddingModelId;
      },
    };
  }

  /** The platform keys, read through the zod config schema. */
  private platformConfig(): PlatformRouteConfig {
    return {
      openRouterApiKey: this.config.get<string>('openRouterApiKey'),
      cohereApiKey: this.config.get<string>('cohereApiKey'),
    };
  }

  /** The tenant's policy, cached hot. */
  private async retentionPolicy(tenantId: number): Promise<RetentionClass> {
    const requiresZdr = await this.cache.getOrSet(
      retentionPolicyCacheKey(tenantId),
      async () => {
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { aiZeroRetention: true },
        });
        return tenant?.aiZeroRetention ?? false;
      },
      CACHE_TTL_HOT_60S,
    );
    return requiresZdr ? 'ZDR' : 'STANDARD';
  }
}

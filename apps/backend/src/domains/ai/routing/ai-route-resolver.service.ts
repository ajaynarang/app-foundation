import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmbeddingModel, LanguageModel } from 'ai';
import type { ModelAlias } from '@app/shared-types';
import { AiCredentialStatus, type AiCredential } from '@appshore/db';

import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { AppCacheService } from '@appshore/platform/infrastructure/cache/app-cache.service';
import { buildKey } from '@appshore/kernel/infrastructure/cache/cache-key.constants';
import { CACHE_TTL_HOT_60S } from '@appshore/kernel/constants/cache.constants';
import { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { getEnvType } from '@appshore/kernel/shared/utils/env-type';
import { DOMAIN_EVENTS } from '../../../platform-glue/events/domain-events.constants';

import { AiNotConfigured } from './ai-not-configured.error';
import { AiCredentialFailing } from './ai-credential-failing.error';
import { CredentialCryptoService } from './credential-crypto.service';
import { ZeroRetentionUnavailable } from '../infrastructure/redaction/zero-retention-unavailable.error';
import { MODEL_CATALOG } from './model-catalog';
import { tunedLanguageModel } from './model-tuning.middleware';
import { withPromptCache, type PromptCacheStrategy } from './prompt-cache';
import {
  PLATFORM_ROUTES,
  TENANT_CREDENTIAL_CAPABILITIES,
  type PlatformRoute,
  type PlatformRouteConfig,
} from './route-registry';
import { AI_NEEDS, type AiNeed, type AiPayer, type ProviderBundle, type ResolvedRoute } from './routing.types';
import type { RetentionClass } from './routing.types';

interface Candidate {
  routeId: string;
  credentialType: string;
  payer: AiPayer;
  retention: RetentionClass;
  promptCache: PromptCacheStrategy;
  /** Key of the built bundle in the in-process cache. */
  cacheKey: string;
  /** When set, stale bundles sharing this prefix are evicted on rebuild, so an old secret does not linger. */
  evictPrefix?: string;
  build: () => ProviderBundle;
  /** A workspace credential's tenant and public id: where a provider credit refusal is recorded. */
  credential?: { tenantId: number; publicId: string };
}

/**
 * Where a provider credit refusal on a workspace's own key is recorded (the credential's `lastError`, and the owner
 * told at most once a day). Bound by the app's routing module; a command-line process has none and only logs.
 */
export interface CreditRefusalSink {
  recordCreditRefusal(tenantId: number, credentialPublicId: string, detail: string): Promise<void>;
}
export const AI_CREDIT_REFUSAL_SINK = Symbol('AI_CREDIT_REFUSAL_SINK');

/** Who pays for a need right now: the platform, a workspace credential (its public id), or nobody (blocked). */
export type NeedPayer = 'platform' | 'none' | string;

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
 * - `AiCredentialFailing` (503): the workspace's own credentials would serve the need but every one is FAILING, or the
 *   one picked cannot be decrypted. Never a fall-through to the platform's key: that would move the bill.
 *
 * Two pools, decided per need and never mixed. The workspace's credentials (bring-your-own-key) when any compatible
 * one exists: the workspace pays, the first ACTIVE one by priority serves. Otherwise the platform routes:
 * `platform-openrouter` (language) and `platform-cohere` (embeddings), both standard retention. A credential the
 * retention policy rules out is inert, treated as absent. The zero-retention platform route and per-workspace
 * sub-keys each add an entry without reshaping this class.
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
    private readonly credentialCrypto: CredentialCryptoService,
    @Optional() @Inject(AI_CREDIT_REFUSAL_SINK) private readonly refusalSink?: CreditRefusalSink,
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
    const credentials = await this.tenantCredentials(tenantId);

    // DISABLED is the owner's choice: absent. FAILING is not: a failing credential that would serve the need blocks
    // it, because the payer boundary is never crossed.
    const considered = credentials.filter((c) => c.status !== AiCredentialStatus.DISABLED);
    const servingNeed = considered.filter((c) => TENANT_CREDENTIAL_CAPABILITIES[c.type].serves.includes(need));
    const compatible = servingNeed.filter(
      (c) => policy === 'STANDARD' || TENANT_CREDENTIAL_CAPABILITIES[c.type].retention(c) === 'ZDR',
    );
    const active = compatible.filter((c) => c.status === AiCredentialStatus.ACTIVE);
    if (active.length) {
      return { payer: 'TENANT', candidates: active.map((c) => this.tenantCandidate(c)), hadRetentionInert: false };
    }
    if (compatible.length) throw new AiCredentialFailing(need);

    const config = this.platformConfig();
    const platformServing = PLATFORM_ROUTES.filter((r) => r.serves.includes(need) && r.isConfigured(config));
    const platformCompatible = platformServing.filter((r) => policy === 'STANDARD' || r.retention === 'ZDR');
    return {
      payer: 'PLATFORM',
      candidates: platformCompatible.map((r) => this.platformCandidate(r, config)),
      hadRetentionInert: servingNeed.length > compatible.length || platformServing.length > platformCompatible.length,
    };
  }

  /**
   * For each need, who pays right now: `platform`, the serving credential's public id, or `none` when the need is
   * blocked (nothing configured, a failing workspace key, or no route the retention policy allows). Reads the same
   * pools as `resolve`, builds nothing and raises no signal.
   */
  async describePayers(tenantId: number): Promise<Record<AiNeed, NeedPayer>> {
    const policy = await this.retentionPolicy(tenantId);
    const out = {} as Record<AiNeed, NeedPayer>;
    for (const need of AI_NEEDS) {
      try {
        const first = (await this.candidatePools(tenantId, need, policy)).candidates[0];
        out[need] = !first ? 'none' : first.payer === 'TENANT' ? first.routeId : 'platform';
      } catch {
        out[need] = 'none';
      }
    }
    return out;
  }

  /**
   * Drop every cached provider bundle of a credential. Called when it is deleted: a removed credential is never
   * rebuilt, so nothing else would evict the closure that holds its decrypted secret.
   */
  evictCredential(credentialId: number): void {
    const prefix = `cred:${credentialId}:`;
    for (const key of this.providerCache.keys()) {
      if (key.startsWith(prefix)) this.providerCache.delete(key);
    }
  }

  /** The keys of the provider bundles held in memory (never their contents). For diagnostics and specs. */
  cachedBundleKeys(): string[] {
    return [...this.providerCache.keys()];
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

  private tenantCandidate(credential: AiCredential): Candidate {
    const capability = TENANT_CREDENTIAL_CAPABILITIES[credential.type];
    return {
      routeId: credential.publicId,
      credentialType: credential.type,
      payer: 'TENANT',
      retention: capability.retention(credential),
      promptCache: capability.promptCache,
      // The row's content keys the bundle: a replaced secret or a rotated key version misses, and the prefix evicts the
      // superseded bundle so an old secret does not stay in memory. `new Date()` accepts a serialized date too.
      cacheKey: `cred:${credential.id}:${credential.keyVersion}:${new Date(credential.updatedAt).getTime()}`,
      evictPrefix: `cred:${credential.id}:`,
      build: () => capability.buildProvider(credential, this.secretOf(credential)),
      credential: { tenantId: credential.tenantId, publicId: credential.publicId },
    };
  }

  /**
   * The decrypted secret, or null for a type that stores none. A secret that cannot be decrypted (the operator removed
   * or changed `AI_CREDENTIALS_KEY`, or the envelope is damaged) refuses the workspace with `AiCredentialFailing`; the
   * platform's key is never used in its place. The reason is logged, never the secret.
   */
  private secretOf(credential: AiCredential): string | null {
    if (!credential.encryptedSecret) return null;
    try {
      return this.credentialCrypto.decrypt(credential.encryptedSecret, credential.keyVersion, {
        tenantId: credential.tenantId,
        credentialPublicId: credential.publicId,
      });
    } catch (err) {
      this.logger.error(
        `Workspace ${credential.tenantId}: AI credential ${credential.publicId} cannot be decrypted (${(err as Error).message})`,
      );
      throw new AiCredentialFailing(TENANT_CREDENTIAL_CAPABILITIES[credential.type].serves[0] ?? 'language');
    }
  }

  private platformCandidate(route: PlatformRoute, config: PlatformRouteConfig): Candidate {
    return {
      routeId: route.routeId,
      credentialType: route.credentialType,
      payer: 'PLATFORM',
      retention: route.retention,
      promptCache: route.promptCache,
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
    const promptCache = this.promptCacheOverride() ?? candidate.promptCache;
    return {
      routeId: candidate.routeId,
      credentialType: candidate.credentialType,
      payer: candidate.payer,
      retention: candidate.retention,
      providerLabel: resolved.providerLabel,
      promptCache,
      languageModel: (alias: ModelAlias): LanguageModel => {
        if (policy === 'ZDR' && !MODEL_CATALOG[alias].zdrCapable) throw new ZeroRetentionUnavailable(alias);
        const base = resolved.languageModel;
        if (!base) throw new AiNotConfigured('language');
        // The tuning is the resolver's, applied per route: effort in the route family's shape, and one retry of a
        // refused generate call on the next alias up, on the same route. Outside it, the route's cache breakpoints.
        return withPromptCache(tunedLanguageModel(base, alias, resolved.effortFamily ?? 'anthropic'), promptCache);
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
      reportCreditRefusal: this.creditRefusalReporter(candidate),
    };
  }

  /** On a workspace credential, the hook that records a provider credit refusal; none on a platform route. */
  private creditRefusalReporter(candidate: Candidate): ((detail: string) => void) | undefined {
    const { credential } = candidate;
    const sink = this.refusalSink;
    if (!credential || !sink) return undefined;
    return (detail: string) => {
      void sink
        .recordCreditRefusal(credential.tenantId, credential.publicId, detail)
        .catch((e: Error) =>
          this.logger.warn(`Recording a credit refusal on ${credential.publicId} failed: ${e.message}`),
        );
    };
  }

  /**
   * `none` when a developer turned prompt caching off (`AI_PROMPT_CACHE_OVERRIDE=none`) to measure the uncached
   * baseline. The config factory resolves it to unset on every deployed task, so no environment check is needed here.
   */
  private promptCacheOverride(): 'none' | undefined {
    return this.config.get<string>('aiPromptCacheOverride') === 'none' ? 'none' : undefined;
  }

  /** The platform keys, read through the zod config schema. */
  private platformConfig(): PlatformRouteConfig {
    return {
      openRouterApiKey: this.config.get<string>('openRouterApiKey'),
      cohereApiKey: this.config.get<string>('cohereApiKey'),
    };
  }

  /**
   * The workspace's credentials by priority: a direct indexed read on every resolve, deliberately uncached. No
   * ciphertext or role ARN sits in a second store, and a change takes effect on the next call.
   */
  private async tenantCredentials(tenantId: number): Promise<AiCredential[]> {
    return this.prisma.aiCredential.findMany({ where: { tenantId }, orderBy: { priority: 'asc' } });
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

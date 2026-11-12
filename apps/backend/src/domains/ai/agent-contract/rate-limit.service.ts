import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppCacheService } from '@appshore/platform/infrastructure/cache/app-cache.service';
import { buildKey } from '@appshore/kernel/infrastructure/cache/cache-key.constants';
import { AgentPrincipal, principalTrustTier } from '@appshore/platform/auth/agent-principal';
import { AGENT_RATE_LIMIT_DEFAULTS, AGENT_RATE_LIMIT_WINDOW_SECONDS } from './agent-rate-limit.constants';

export interface ConsumeOverrides {
  rateLimitPerMinute?: number;
}

/** Which budget a call spent: the principal's own, or the workspace ceiling all its third-party agents share. */
export type RateLimitBudget = 'principal' | 'workspace';

export interface ConsumeResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  /** The budget that decided — on a deny, the one that ran out. */
  budget: RateLimitBudget;
}

/**
 * The key a principal's budget is counted under. An OAuth client's budget is per **client and human**: one
 * popular connector (every Claude.ai user shares its client id) must not let one person starve the rest.
 */
export function rateLimitSubject(principal: AgentPrincipal): string {
  return principal.kind === 'oauth_client'
    ? `oauth:${principal.clientId}:${principal.onBehalfOfUserId}`
    : principal.auditId;
}

@Injectable()
export class RateLimitService {
  constructor(
    private readonly cache: AppCacheService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Spend `cost` from the principal's per-minute budget, and — for third-party agents (OAuth clients, API keys) —
   * from the workspace ceiling they share, so many keys or connected humans cannot add up past it.
   */
  async consume(principal: AgentPrincipal, cost = 1, overrides: ConsumeOverrides = {}): Promise<ConsumeResult> {
    const windowSeconds = AGENT_RATE_LIMIT_WINDOW_SECONDS;
    const windowBucket = Math.floor(Date.now() / 1000 / windowSeconds);
    const resetAt = new Date((windowBucket + 1) * windowSeconds * 1000);

    const own = await this.spend(
      buildKey('app:agent', 'rate', rateLimitSubject(principal), windowBucket),
      overrides.rateLimitPerMinute ?? AGENT_RATE_LIMIT_DEFAULTS[principal.kind],
      cost,
      windowSeconds,
    );
    if (!own.allowed || principalTrustTier(principal) !== 'third_party') {
      return { ...own, resetAt, budget: 'principal' };
    }

    const workspace = await this.spend(
      buildKey('app:agent', 'rate', 'tenant', principal.tenantId, windowBucket),
      // AGENT_TENANT_CEILING_PER_MINUTE, default 600 (config/configuration.ts)
      this.config.getOrThrow<number>('edge.agentTenantCeilingPerMinute'),
      cost,
      windowSeconds,
    );
    if (!workspace.allowed) return { ...workspace, resetAt, budget: 'workspace' };
    // Report whichever budget is closer to running out.
    return workspace.remaining < own.remaining
      ? { ...workspace, resetAt, budget: 'workspace' }
      : { ...own, resetAt, budget: 'principal' };
  }

  private async spend(key: string, limit: number, cost: number, windowSeconds: number) {
    const count = await this.cache.increment(key, cost, windowSeconds);
    return { allowed: count <= limit, limit, remaining: Math.max(0, limit - count) };
  }
}

import { Injectable } from '@nestjs/common';
import { SallyCacheService } from '../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../infrastructure/cache/cache-key.constants';
import { AgentPrincipal } from './agent-principal';
import { AGENT_RATE_LIMIT_DEFAULTS, AGENT_RATE_LIMIT_WINDOW_SECONDS } from './agent-rate-limit.constants';

export interface ConsumeOverrides {
  rateLimitPerMinute?: number;
}

export interface ConsumeResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
}

@Injectable()
export class RateLimitService {
  constructor(private readonly cache: SallyCacheService) {}

  async consume(principal: AgentPrincipal, cost = 1, overrides: ConsumeOverrides = {}): Promise<ConsumeResult> {
    const defaultLimit = AGENT_RATE_LIMIT_DEFAULTS[principal.kind];
    const limit = overrides.rateLimitPerMinute ?? defaultLimit;

    const windowSeconds = AGENT_RATE_LIMIT_WINDOW_SECONDS;
    const windowBucket = Math.floor(Date.now() / 1000 / windowSeconds);
    const key = buildKey('sally:agent', 'rate', principal.auditId, windowBucket);

    const count = await this.cache.increment(key, cost, windowSeconds);
    const remaining = Math.max(0, limit - count);
    const resetAt = new Date((windowBucket + 1) * windowSeconds * 1000);

    return { allowed: count <= limit, limit, remaining, resetAt };
  }
}

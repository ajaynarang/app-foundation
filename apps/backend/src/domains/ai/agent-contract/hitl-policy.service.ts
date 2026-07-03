import { Injectable } from '@nestjs/common';
import { AgentScope, scopeTier, SCOPE_TIERS } from '@app/shared-types';
import { AgentPrincipal } from '@appshore/platform/auth/agent-principal';

export type HitlTier = 'none' | 'standard' | 'sensitive';

@Injectable()
export class HitlPolicyService {
  /**
   * Resolve the HITL tier from (tool scope) × (principal kind/trust).
   * Desk principals bypass per-call HITL for standard writes (pre-authorized at enable).
   */
  resolveTier(scope: AgentScope, principal: AgentPrincipal): HitlTier {
    const tier = scopeTier(scope);

    if (tier === SCOPE_TIERS.READ) return 'none';

    if (principal.kind === 'desk_responsibility') {
      return tier === SCOPE_TIERS.SENSITIVE ? 'sensitive' : 'none';
    }

    if (principal.kind === 'user') {
      return tier === SCOPE_TIERS.SENSITIVE ? 'sensitive' : 'standard';
    }

    // oauth_client or api_key (third-party): same tier mapping as user, step-up differs in Phase B
    return tier === SCOPE_TIERS.SENSITIVE ? 'sensitive' : 'standard';
  }

  tokenTtlSeconds(tier: HitlTier): number {
    switch (tier) {
      case 'standard':
        return 300;
      case 'sensitive':
        return 120;
      case 'none':
      default:
        return 0;
    }
  }
}

import { Injectable } from '@nestjs/common';
import { AgentScope, scopeTier, SCOPE_TIERS } from '@app/shared-types';
import { AgentPrincipal } from '@appshore/platform/auth/agent-principal';

export type HitlTier = 'none' | 'standard' | 'sensitive';

@Injectable()
export class HitlPolicyService {
  /**
   * Resolve the HITL tier of a call from the tool's scope. Every principal kind gets the same tier; what differs is
   * who confirms. The pipeline challenges a third-party agent, a chat user confirms through `confirm-action`, and a
   * Desk duty is never challenged by the pipeline (Desk's gate step runs before every execute and gates by this same
   * tier). The tier is recorded on the audit row for every kind, Desk included.
   */
  resolveTier(scope: AgentScope, _principal: AgentPrincipal): HitlTier {
    const tier = scopeTier(scope);
    if (tier === SCOPE_TIERS.READ) return 'none';
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

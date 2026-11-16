import { Injectable } from '@nestjs/common';
import { AgentScope, hitlTierForScope, type HitlTier } from '@app/shared-types';
import { AgentPrincipal } from '@appshore/platform/auth/agent-principal';

export type { HitlTier };

@Injectable()
export class HitlPolicyService {
  /**
   * Resolve the HITL tier of a call from the tool's scope. Every principal kind gets the same tier; what differs is
   * who confirms. The pipeline challenges a third-party agent, a chat user confirms a card raised by `confirm-action`
   * (the pipeline spends that grant), and a
   * Desk duty is never challenged by the pipeline (Desk's gate step runs before every execute and gates by this same
   * tier). The tier is recorded on the audit row for every kind, Desk included. The rule itself is
   * `hitlTierForScope` in shared-types, the same function Desk's `decideGate` calls.
   */
  resolveTier(scope: AgentScope, _principal: AgentPrincipal): HitlTier {
    return hitlTierForScope(scope);
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

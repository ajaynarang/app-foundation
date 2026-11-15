import { Injectable } from '@nestjs/common';
import type { AgentScope } from '@app/shared-types';
import { AgentPrincipal } from '@appshore/platform/auth/agent-principal';
import { decideToolCall, type ConfirmationTier, type ToolCaller } from './tool-policy';

export type HitlTier = ConfirmationTier;

/** How the one tool rule sees a pipeline principal. A Desk job reaches the pipeline only after its gate step. */
export function callerOf(principal: AgentPrincipal): ToolCaller {
  if (principal.kind === 'user') return { kind: 'person' };
  if (principal.kind === 'desk_responsibility') return { kind: 'cleared-job' };
  return { kind: 'outside' };
}

@Injectable()
export class HitlPolicyService {
  /**
   * The confirmation a tool call needs, from (tool scope) × (who is calling).
   * An adapter over `decideToolCall` — the rules live there, not here.
   */
  resolveTier(scope: AgentScope, principal: AgentPrincipal): HitlTier {
    return decideToolCall(scope, callerOf(principal)).confirmation;
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

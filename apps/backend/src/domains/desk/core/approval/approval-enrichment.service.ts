import { Injectable } from '@nestjs/common';
import { DeskEpisodeStepKind } from '@appshore/db';

import type { ApprovalArtifact, ApprovalDecisionHeader } from '../types';

/**
 * Computes the canonical approval-sheet payload (artifact, decisionHeader,
 * assistantRead, context, confidence) from an approval row + its episode's step
 * list. Runs at read time so we don't have to migrate the DeskApproval table or
 * recompute on every workflow iteration.
 *
 * This is an extension point. The starter ships an EMPTY responsibility
 * registry, so `enrich()` returns the empty payload for every key and the UI
 * falls back to raw-action rendering. When you add a responsibility, branch on
 * `input.responsibilityKey` here and build its artifact from the step outputs
 * (use the `pickStepOutput` helper below).
 */
@Injectable()
export class ApprovalEnrichmentService {
  /**
   * Enrich a single approval row with the canonical decision-sheet payload.
   * Returns the payload as a plain object suitable for spreading onto the
   * ApprovalRecord shape.
   */
  enrich(_input: {
    responsibilityKey: string;
    proposedAction: Record<string, unknown>;
    steps: readonly StepOutputLite[];
  }): EnrichedApprovalPayload {
    // No responsibilities registered — every approval renders from the raw
    // proposed action. Register per-responsibility adapters here, e.g.:
    //
    //   if (_input.responsibilityKey === 'welcome') {
    //     const hydrate = pickStepOutput<MyHydrate>(_input.steps, DeskEpisodeStepKind.HYDRATE);
    //     return buildWelcomeApprovalPayload({ hydrate, proposedAction: _input.proposedAction });
    //   }
    return EMPTY_PAYLOAD;
  }
}

export interface EnrichedApprovalPayload {
  artifact: ApprovalArtifact | null;
  decisionHeader: ApprovalDecisionHeader | null;
  assistantRead: string | null;
  context: string[] | null;
  confidence: number | null;
}

const EMPTY_PAYLOAD: EnrichedApprovalPayload = {
  artifact: null,
  decisionHeader: null,
  assistantRead: null,
  context: null,
  confidence: null,
};

export interface StepOutputLite {
  kind: DeskEpisodeStepKind;
  sequence: number;
  output: Record<string, unknown> | null;
}

/**
 * Pick the latest output for a given step kind — the building block a
 * responsibility's approval adapter uses to read its hydrate/perceive/decide/
 * draft step outputs. Most-recent step wins (draft can re-run on reject+retry).
 */
export function pickStepOutput<T>(steps: readonly StepOutputLite[], kind: DeskEpisodeStepKind): T | null {
  const matching = steps.filter((s) => s.kind === kind);
  if (matching.length === 0) return null;
  const latest = matching.reduce((best, s) => (s.sequence > best.sequence ? s : best), matching[0]);
  return (latest.output as T | null) ?? null;
}

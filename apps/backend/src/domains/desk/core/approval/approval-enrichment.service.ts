import { Injectable } from '@nestjs/common';
import { DeskEpisodeStepKind } from '@prisma/client';
import {
  ResponsibilityKeySchema,
  type ApprovalArtifact,
  type ApprovalDecisionHeader,
  type ArFollowup as ArFollowupTypes,
  type CloseoutReview as CloseoutReviewTypes,
  type DocumentExpiry as DocumentExpiryTypes,
  type SettlementReview as SettlementReviewTypes,
} from '@sally/shared-types';

import { buildArFollowupApprovalPayload } from '../../responsibilities/ar-followup/approval-adapter';
import type { DraftOutput, HydrateOutput, PerceiveOutput } from '../../responsibilities/ar-followup/step.types';
import { buildCloseoutReviewApprovalPayload } from '../../responsibilities/closeout-review/approval-adapter';
import type { CloseoutHydrateOutput } from '../../responsibilities/closeout-review/step.types';
import { buildDocumentExpiryApprovalPayload } from '../../responsibilities/document-expiry/approval-adapter';
import type {
  DocumentExpiryDraftOutput,
  DocumentExpiryHydrateOutput,
} from '../../responsibilities/document-expiry/step.types';
import { buildSettlementReviewApprovalPayload } from '../../responsibilities/settlement-review/approval-adapter';
import type { SettlementReviewHydrateOutput } from '../../responsibilities/settlement-review/step.types';

/**
 * Computes the canonical approval-sheet payload (artifact, decisionHeader,
 * sallysRead, context, confidence) from an approval row + its episode's
 * step list. Runs at read time so we don't have to migrate the DeskApproval
 * table or recompute on every workflow iteration.
 *
 * One dispatcher-style method per responsibility. When a new responsibility
 * ships, register its adapter here. The UI never branches on responsibility
 * — it just renders whatever shape this service returns.
 *
 * See .docs/plans/06-sally-ai/desk-approval-canonical-prototype.html (T23).
 */
@Injectable()
export class ApprovalEnrichmentService {
  /**
   * Enrich a single approval row with the canonical decision-sheet payload.
   * Returns the payload as a plain object suitable for spreading onto the
   * ApprovalRecord shape.
   */
  enrich(input: {
    responsibilityKey: string;
    proposedAction: Record<string, unknown>;
    steps: readonly StepOutputLite[];
  }): EnrichedApprovalPayload {
    if (input.responsibilityKey === ResponsibilityKeySchema.enum.ar_followup) {
      const payload = buildArFollowupApprovalPayload({
        hydrate: pickStepOutput<HydrateOutput>(input.steps, DeskEpisodeStepKind.HYDRATE),
        perceive: pickStepOutput<ArFollowupTypes.ArFollowupPerceive>(input.steps, DeskEpisodeStepKind.PERCEIVE),
        decide: pickStepOutput<ArFollowupTypes.ArFollowupDecide>(input.steps, DeskEpisodeStepKind.DECIDE),
        draft: pickStepOutput<ArFollowupTypes.ArFollowupDraft>(input.steps, DeskEpisodeStepKind.DRAFT),
        proposedAction: input.proposedAction,
      });
      return payload;
    }

    if (input.responsibilityKey === ResponsibilityKeySchema.enum.closeout_review) {
      const payload = buildCloseoutReviewApprovalPayload({
        hydrate: pickStepOutput<CloseoutHydrateOutput>(input.steps, DeskEpisodeStepKind.HYDRATE),
        perceive: pickStepOutput<CloseoutReviewTypes.CloseoutReviewPerceive>(input.steps, DeskEpisodeStepKind.PERCEIVE),
        decide: pickStepOutput<CloseoutReviewTypes.CloseoutReviewDecide>(input.steps, DeskEpisodeStepKind.DECIDE),
        draft: pickStepOutput<CloseoutReviewTypes.CloseoutReviewDraft>(input.steps, DeskEpisodeStepKind.DRAFT),
        proposedAction: input.proposedAction,
      });
      return payload;
    }

    if (input.responsibilityKey === ResponsibilityKeySchema.enum.document_expiry) {
      return buildDocumentExpiryApprovalPayload({
        hydrate: pickStepOutput<DocumentExpiryHydrateOutput>(input.steps, DeskEpisodeStepKind.HYDRATE),
        perceive: pickStepOutput<DocumentExpiryTypes.DocumentExpiryPerceive>(input.steps, DeskEpisodeStepKind.PERCEIVE),
        decide: pickStepOutput<DocumentExpiryTypes.DocumentExpiryDecide>(input.steps, DeskEpisodeStepKind.DECIDE),
        draft: pickStepOutput<DocumentExpiryDraftOutput>(input.steps, DeskEpisodeStepKind.DRAFT),
        proposedAction: input.proposedAction,
      });
    }

    if (input.responsibilityKey === ResponsibilityKeySchema.enum.settlement_review) {
      return buildSettlementReviewApprovalPayload({
        hydrate: pickStepOutput<SettlementReviewHydrateOutput>(input.steps, DeskEpisodeStepKind.HYDRATE),
        perceive: pickStepOutput<SettlementReviewTypes.SettlementReviewPerceive>(
          input.steps,
          DeskEpisodeStepKind.PERCEIVE,
        ),
        decide: pickStepOutput<SettlementReviewTypes.SettlementReviewDecide>(input.steps, DeskEpisodeStepKind.DECIDE),
        proposedAction: input.proposedAction,
      });
    }

    // Unknown responsibility — leave all optional fields null so the UI
    // falls back to raw-action rendering. Add adapters here as new
    // responsibilities ship.
    return EMPTY_PAYLOAD;
  }
}

export interface EnrichedApprovalPayload {
  artifact: ApprovalArtifact | null;
  decisionHeader: ApprovalDecisionHeader | null;
  sallysRead: string | null;
  context: string[] | null;
  confidence: number | null;
}

const EMPTY_PAYLOAD: EnrichedApprovalPayload = {
  artifact: null,
  decisionHeader: null,
  sallysRead: null,
  context: null,
  confidence: null,
};

export interface StepOutputLite {
  kind: DeskEpisodeStepKind;
  sequence: number;
  output: Record<string, unknown> | null;
}

function pickStepOutput<T>(steps: readonly StepOutputLite[], kind: DeskEpisodeStepKind): T | null {
  // Most-recent step wins — the draft step can re-run on reject+retry,
  // and we want the latest artifact the operator is evaluating.
  const matching = steps.filter((s) => s.kind === kind);
  if (matching.length === 0) return null;
  const latest = matching.reduce((best, s) => (s.sequence > best.sequence ? s : best), matching[0]);
  return (latest.output as T | null) ?? null;
}

/**
 * Perceive output type re-exported for cross-file type inference.
 * Silences an unused-import warning in strict mode.
 */
export type { PerceiveOutput };

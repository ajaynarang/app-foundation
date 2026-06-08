import { CloseoutReview } from '@app/shared-types';

import type { ResponsibilityDefinition } from '../definition.types';

import { closeoutReviewConditionsEvaluator } from './conditions-evaluator';
import { CLOSEOUT_REVIEW_REINFORCEMENT_JUDGE } from './reinforcement-judge';

/**
 * Closeout Review — canonical metadata.
 *
 * Single source of truth for what the responsibility does, what tools it
 * uses, and the default tenant config at seed time. Consumed by the
 * bootstrap, the responsibility controller (UI metadata), and the trigger
 * service (scheduled cron pattern).
 */
export const CLOSEOUT_REVIEW_DEFINITION: ResponsibilityDefinition = {
  key: 'closeout_review',
  agentKey: 'sally-billing',
  title: 'Catch delivered loads that never got invoiced',
  description:
    'Daily scan of loads delivered 48h+ ago without an invoice. When the load is genuinely billable, Sally drafts a DRAFT invoice for your approval. When it is blocked (no charges, missing POD/rate-con), she flags the gap instead of generating a wrong invoice.',
  lifecycle: 'AVAILABLE',

  // User-editable conditions schema (rendered on the settings page).
  conditionsSchema: CloseoutReview.CloseoutReviewConditionsSchema,
  conditionsUI: CloseoutReview.CloseoutReviewConditionsUI,

  // Pure evaluator the shared gate step uses to apply closeout's hard rules
  // (min/max charge, excluded customers). The job-blind gate hands it
  // closeout's own load-shaped hydrate output verbatim.
  conditionsEvaluator: closeoutReviewConditionsEvaluator,

  // Default tenant config at seed time — conservative + safe by default.
  defaults: {
    trustLevel: 'SUPERVISED',
    conditions: {
      minHoursSinceDelivery: CloseoutReview.CLOSEOUT_REVIEW_DEFAULT_MIN_HOURS,
    },
  },

  // Triggers authored in code (not user-editable). Daily 9:00 tenant-local
  // cron scans delivered-uninvoiced loads. Manual trigger always available.
  triggers: [{ kind: 'scheduled', cron: '0 9 * * *', tz: 'tenant' }, { kind: 'manual' }],

  // Tool inventory — sourced from billing.tool.ts (get-billing-readiness,
  // get-load-charges) + invoice-action.tool.ts (generate-invoice). These are
  // the tools execute.step may call; the principal is granted the
  // corresponding scopes automatically via ScopeRegistryService lookup.
  tools: ['get-billing-readiness', 'get-load-charges', 'generate-invoice'],

  // Decides which direction a closing transition moves a used memory's
  // confidence. See reinforcement-judge.ts for the decision table.
  reinforcementJudge: CLOSEOUT_REVIEW_REINFORCEMENT_JUDGE,
};

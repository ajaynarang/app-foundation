import { SettlementReview } from '@app/shared-types';

import type { ResponsibilityDefinition } from '../definition.types';

import { settlementReviewConditionsEvaluator } from './conditions-evaluator';
import { SETTLEMENT_REVIEW_REINFORCEMENT_JUDGE } from './reinforcement-judge';

/**
 * Settlement Review — canonical metadata.
 *
 * Single source of truth for what the responsibility does, what tools it uses,
 * and the default tenant config at seed time. Consumed by bootstrap, the
 * responsibility controller (UI metadata), and the trigger service.
 *
 * Sally is the validation layer the system lacks: approve-settlement does ZERO
 * validation today (negative net, deductions>gross, zero line items all pass).
 * This responsibility approves clean drafts (one-tap, human-approved), flags
 * anomalous ones (NEVER auto-approves), and surfaces stale ones.
 */
export const SETTLEMENT_REVIEW_DEFINITION: ResponsibilityDefinition = {
  key: 'settlement_review',
  agentKey: 'sally-payroll',
  title: 'Review & approve driver settlements',
  description:
    'Weekly review of draft driver settlements. Approves clean ones in one tap, flags anomalies (negative net, deductions over gross, no loads, way off the driver’s average, or stale drafts) for you to fix — and never auto-approves a settlement it doesn’t trust.',
  lifecycle: 'AVAILABLE',

  conditionsSchema: SettlementReview.SettlementReviewConditionsSchema,
  conditionsUI: SettlementReview.SettlementReviewConditionsUI,

  // Pure evaluator the shared gate step uses. In practice the only executed
  // tool (approve-settlement) is SENSITIVE → always gates regardless; the
  // evaluator exists for the excludeDriverIds rule + a single source of truth.
  conditionsEvaluator: settlementReviewConditionsEvaluator,

  // Conservative defaults — SUPERVISED + a 7-day stale window. Driver pay is
  // the one number a fleet cannot get wrong; safe by default.
  defaults: {
    trustLevel: 'SUPERVISED',
    conditions: {
      staleDays: SettlementReview.SETTLEMENT_REVIEW_DEFAULT_STALE_DAYS,
    },
  },

  // Weekly Mon 8:00 tenant-local cron scans DRAFT settlements. Manual trigger
  // always available from the UI.
  triggers: [{ kind: 'scheduled', cron: '0 8 * * 1', tz: 'tenant' }, { kind: 'manual' }],

  // Tool inventory — get-settlement-detail (read) + approve-settlement
  // (settlements:write:sensitive → always gates). Scopes are derived from the
  // scope registry via these tool names; no hand-maintained list.
  tools: ['get-settlement-detail', 'approve-settlement'],

  reinforcementJudge: SETTLEMENT_REVIEW_REINFORCEMENT_JUDGE,
};

import { ArFollowup } from '@app/shared-types';

import type { ResponsibilityDefinition } from '../definition.types';

import { arFollowupConditionsEvaluator } from './conditions-evaluator';
import { AR_FOLLOWUP_REINFORCEMENT_JUDGE } from './reinforcement-judge';

/**
 * AR Follow-up — canonical metadata.
 *
 * This is the single source of truth for what the responsibility does,
 * what tools it uses, and what the default tenant config looks like at
 * seed time. Consumed by:
 *   - seeds/03-desk-responsibilities.seed.ts (creates the per-tenant row)
 *   - ResponsibilityController (GET /desk/responsibilities reads this
 *     for UI metadata like title/description/conditionsUI)
 *   - TriggerService (scheduled cron pattern, once that's wired)
 */
export const AR_FOLLOWUP_DEFINITION: ResponsibilityDefinition = {
  key: 'ar_followup',
  agentKey: 'sally-billing',
  title: 'Nudge customers on overdue invoices',
  description:
    'Scans overdue invoices, decides whether today is the right day to reach out, drafts a friendly email, and asks for approval before sending (or sends automatically when your hard rules are met).',
  lifecycle: 'AVAILABLE',

  // User-editable conditions schema (rendered on the settings page).
  conditionsSchema: ArFollowup.ArFollowupConditionsSchema,
  conditionsUI: ArFollowup.ArFollowupConditionsUI,

  // Pure evaluator the shared gate step uses to apply AR's hard rules
  // (max amount, first-reminder-only, excluded customers) — single source
  // of truth for AR conditions logic.
  conditionsEvaluator: arFollowupConditionsEvaluator,

  // Default tenant config at seed time — sensible conservative defaults.
  defaults: {
    trustLevel: 'SUPERVISED',
    conditions: {
      firstReminderOnly: true,
    },
  },

  // Triggers authored in code (not user-editable per design-doc §8.1).
  // Daily 9:00 tenant-local cron scans overdue invoices.
  // Manual trigger always available from the UI.
  triggers: [{ kind: 'scheduled', cron: '0 9 * * *', tz: 'tenant' }, { kind: 'manual' }],

  // Tool inventory — sourced from invoice.tool.ts + customer.tool.ts +
  // invoice-action.tool.ts + send-email.tool.ts (existing domain MCP tools).
  // These are the tools execute.step can call; principal is granted the
  // corresponding scopes automatically via ScopeRegistryService lookup.
  tools: [
    'get-invoice-detail',
    'get-customer-detail',
    'get-customer-payment-stats',
    'get-communication-history',
    'send-email',
    'record-promise-to-pay',
    'escalate-invoice',
  ],

  // Walks every memory hydrate retrieved for this run and decides which
  // direction (CONFIRM / CONTRADICT / NEUTRAL) the close transition moves
  // its confidence. See reinforcement-judge.ts for the decision table.
  reinforcementJudge: AR_FOLLOWUP_REINFORCEMENT_JUDGE,
};

import { DocumentExpiry } from '@app/shared-types';

import type { ResponsibilityDefinition } from '../definition.types';

import { documentExpiryConditionsEvaluator } from './conditions-evaluator';
import { DOCUMENT_EXPIRY_REINFORCEMENT_JUDGE } from './reinforcement-judge';

/**
 * Document Expiry — canonical metadata.
 *
 * The ACTUATOR for ONE slice of Shield's output: open DRIVERS
 * credential-expiry findings (CDL + medical card in v1). Shield detects
 * (sensor); this responsibility reminds the right person and gets approval
 * before sending (actuator). It does NOT re-implement expiry detection and
 * does NOT use the load-centric document-compliance tool.
 *
 * Single source of truth, consumed by:
 *   - bootstrap-desk-for-tenant.ts (creates the per-tenant row)
 *   - ResponsibilityController (GET /desk/responsibilities reads title/
 *     description/conditionsUI for the UI)
 *   - TriggerService (scheduled cron pattern)
 */
export const DOCUMENT_EXPIRY_DEFINITION: ResponsibilityDefinition = {
  key: 'document_expiry',
  agentKey: 'sally-compliance',
  title: 'Remind drivers before credentials expire',
  description:
    'Acts on Shield’s open driver-credential findings (CDL + medical card). Drafts a renewal reminder to the driver — or the admin when a credential is expired or critical — and asks for approval before sending.',
  lifecycle: 'AVAILABLE',

  conditionsSchema: DocumentExpiry.DocumentExpiryConditionsSchema,
  conditionsUI: DocumentExpiry.DocumentExpiryConditionsUI,
  conditionsEvaluator: documentExpiryConditionsEvaluator,

  // Conservative defaults: act on both severities + both v1 credentials,
  // supervised so the operator approves each reminder.
  defaults: {
    trustLevel: 'SUPERVISED',
    conditions: {
      severities: [...DocumentExpiry.DOCUMENT_EXPIRY_SEVERITIES],
      credentialTypes: [...DocumentExpiry.DOCUMENT_EXPIRY_CREDENTIAL_TYPES],
    },
  },

  // Daily 7:00 tenant-local sweep over open Shield credential-expiry
  // findings + always-available manual run.
  triggers: [{ kind: 'scheduled', cron: '0 7 * * *', tz: 'tenant' }, { kind: 'manual' }],

  // Tool inventory — outbound comms only. Principal scopes derive from these
  // via ScopeRegistryService (both gate under SUPERVISED at standard tier).
  tools: ['send-email', 'send-sms'],

  reinforcementJudge: DOCUMENT_EXPIRY_REINFORCEMENT_JUDGE,
};

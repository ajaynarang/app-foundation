import { ToolNames } from '../../../ai/agent-contract/tool-names.constants';
import type { ResponsibilityDefinition } from '../definition.types';

import { supportFollowupConditionsEvaluator } from './conditions-evaluator';
import { SUPPORT_FOLLOWUP_REINFORCEMENT_JUDGE } from './reinforcement-judge';
import {
  SUPPORT_FOLLOWUP_DEFAULT_CONDITIONS,
  SupportFollowupConditionsSchema,
  SupportFollowupConditionsUI,
} from './schemas';
import { SUPPORT_FOLLOWUP_KEY } from './step.types';

/**
 * Support follow-up: the reference Desk job. It is real (it posts a reply on a support ticket the workspace opened
 * and nobody answered) and it is the job to copy when you write your own. Every file in this folder is one piece of
 * the contract:
 *
 *   definition.ts            this file: what the job is, its triggers, tools and defaults
 *   schemas.ts               the operator's conditions and the three model outputs (Zod)
 *   fan-out.ts               the sensor: which records need a run (one cheap, tenant-scoped query)
 *   preflight.ts             checks that need no model, run before any LLM cost
 *   steps/                   hydrate (load once), then perceive, decide, draft (one model call each)
 *   prompts/                 the system prompt of each model step, and their names
 *   conditions-evaluator.ts  the hard rules the gate applies under ASSISTED trust
 *   workflow/                the Inngest function: the fixed order of steps and every way it can end
 *   approval-adapter.ts      what the approval sheet shows
 *   reinforcement-judge.ts   whether the way an episode closed agrees with a memory it used
 *
 * Where it is registered (remove these to delete the job):
 *   responsibilities/index.ts                     the registry entry
 *   core/trigger/trigger.service.ts               `runSupportFollowupForTenant` and its `runByKey` case
 *   core/inngest/desk-inngest-functions.ts        the workflow function
 *   core/inngest/inngest.client.ts                the typed run event
 *   core/approval/approval-enrichment.service.ts  the approval adapter
 *   responsibilities/desk-prompt.registrar.ts     the prompt fallbacks
 *   apps/backend/scripts/seed-langfuse-prompts.ts the prompts in Langfuse
 *   shared-steps/outcomes.ts                      `FOLLOWUP_SENT`
 */
export const SUPPORT_FOLLOWUP_DEFINITION: ResponsibilityDefinition = {
  key: SUPPORT_FOLLOWUP_KEY,
  agentKey: 'assistant',
  title: 'Follow up on quiet support tickets',
  description:
    'Finds support tickets your workspace opened that nobody has replied on for a few days, drafts a short follow-up, and asks you before posting it (or posts it without asking when your rules are met).',
  lifecycle: 'AVAILABLE',

  conditionsSchema: SupportFollowupConditionsSchema,
  conditionsUI: SupportFollowupConditionsUI,
  conditionsEvaluator: supportFollowupConditionsEvaluator,

  defaults: {
    trustLevel: 'SUPERVISED',
    conditions: SUPPORT_FOLLOWUP_DEFAULT_CONDITIONS,
  },

  // A declared schedule never fires by itself: the scheduler runs a job only when it is enabled, armed for
  // automatic runs and the workspace's master switch is on. Manual "Run now" always works.
  triggers: [{ kind: 'scheduled', cron: '0 9 * * *', tz: 'tenant' }, { kind: 'manual' }],

  // The tools the execute step may call. The job's permissions are exactly these tools' scopes.
  tools: [ToolNames.REPLY_TO_SUPPORT_TICKET],

  reinforcementJudge: SUPPORT_FOLLOWUP_REINFORCEMENT_JUDGE,
};

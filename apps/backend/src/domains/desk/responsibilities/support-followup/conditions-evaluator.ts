import type { ConditionsEvaluator } from '../definition.types';

import { SupportFollowupConditionsSchema } from './schemas';
import type { HydrateOutput } from './step.types';

/**
 * Support follow-up's hard rules, as one pure function. The shared gate step calls it with the conditions snapshotted
 * on the episode and this job's own hydrate output; the gate itself knows nothing about tickets. Under ASSISTED trust
 * the follow-up is sent without asking only when every check passes.
 */
export const supportFollowupConditionsEvaluator: ConditionsEvaluator = (conditions, hydrate) => {
  const rules = SupportFollowupConditionsSchema.parse(conditions ?? {});
  const { ticket, priorFollowUpCount } = (hydrate as HydrateOutput).entity;

  const followUpCountOk = priorFollowUpCount < rules.maxFollowUps;
  const priorityOk = rules.autoSendPriorities.includes(ticket.priority);

  return {
    checks: { followUpCountOk, priorityOk },
    conditionsMet: followUpCountOk && priorityOk,
  };
};

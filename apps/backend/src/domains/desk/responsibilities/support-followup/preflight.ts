import type { SupportStatus } from '@appshore/db';

import { DESK_OUTCOMES } from '../../shared-steps/outcomes';
import type { HydratePreflightResult } from '../../shared-steps/step.types';
import { FOLLOWABLE_STATUSES } from './fan-out';

/**
 * The checks that need no model, run from hydrate before any LLM cost. A ticket can change between the sweep that
 * picked it and the run: support may have answered or closed it.
 */
export function evaluatePreflight(input: {
  status: SupportStatus;
  daysQuiet: number;
  staleAfterDays: number;
}): HydratePreflightResult {
  if (!FOLLOWABLE_STATUSES.includes(input.status)) {
    return {
      action: 'abort',
      outcome: DESK_OUTCOMES.PREFLIGHT_ABORTED,
      reason: `Ticket is ${input.status}: nothing to follow up`,
    };
  }
  if (input.daysQuiet < input.staleAfterDays) {
    return {
      action: 'skip',
      outcome: DESK_OUTCOMES.PREFLIGHT_SKIPPED,
      reason: `Last reply was ${input.daysQuiet} day(s) ago, under the ${input.staleAfterDays}-day wait`,
    };
  }
  return { action: 'proceed' };
}

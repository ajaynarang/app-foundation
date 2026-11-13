import type { Inngest, InngestFunction } from 'inngest';

import { createDeskSchedulerFunction } from '../scheduler/desk-scheduler.function';

/**
 * Every Desk function served to Inngest. The starter ships no responsibility workflow functions (the registry is
 * empty). When you add a responsibility, build its Inngest function (one per responsibility, listening for
 * `<app>/desk.<key>.run`), give its config `onFailure: reportDeskFunctionFailure` (from `./desk-function-failure`),
 * and add it here. `desk-function-failure.spec.ts` fails for a function served without a failure handler.
 */
export function buildDeskInngestFunctions(client: Inngest): InngestFunction.Any[] {
  const responsibilityFunctions: InngestFunction.Any[] = [];
  return [...responsibilityFunctions, createDeskSchedulerFunction(client)];
}

import { mergeJobContext, type JobContextDecl } from '@appshore/kernel/infrastructure/rls/job-context-registry';
import { registerSystemReasons } from '@appshore/kernel/infrastructure/rls/system-reasons';
import { APP_JOB_NAMES } from './job-names';

/**
 * YOUR jobs' tenant context, beside `job-names.ts`. Every job name a handler lists (`readonly jobNames = [...]`)
 * declares here how it gets its tenant: `tenant` (the payload names it), `forEachTenant` or `system` with a reason, or
 * `noDatabase`. The foundation's names are declared in `@appshore/kernel` (`job-context-registry.ts`); a name declared
 * in both fails at load. Held by `architecture/rls-job-context-coverage.spec.ts`.
 *
 * A reason used here that the foundation does not list goes in `APP_SYSTEM_REASONS`, registered below at module load.
 * Adding one is a reviewed change: once row-level security is enforced, each reason is a standing hole in it.
 */
export const APP_SYSTEM_REASONS = {
  /** The daily re-test of every workspace AI credential: lists credentials of every tenant, tests each as its own. */
  AI_CREDENTIAL_REVALIDATE: 'cron.ai-credential-revalidate',
} as const;

registerSystemReasons(Object.values(APP_SYSTEM_REASONS));

export const APP_JOB_CONTEXT: Readonly<Record<string, JobContextDecl>> = {
  [APP_JOB_NAMES.BULK_OPS.AI_CREDENTIAL_REVALIDATE]: { forEachTenant: APP_SYSTEM_REASONS.AI_CREDENTIAL_REVALIDATE },
  // One integration's refresh; the payload carries that integration's tenant.
  [APP_JOB_NAMES.BULK_OPS.OAUTH_REFRESH]: { tenant: true },
};

/** Every job name's declaration: the foundation's and the app's. */
export const JOB_CONTEXT = mergeJobContext(APP_JOB_CONTEXT);

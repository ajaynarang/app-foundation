import type { AppJobVocabulary, JobCategoryDefinition } from '@appshore/kernel/infrastructure/queue/job-vocabulary';

/**
 * YOUR job vocabulary: the app's queues, job names, labels, categories and manual types, like the event registry.
 *
 * The kernel's `QUEUE_NAMES`, `*_JOB_NAMES` and `TYPE_DISPLAY_NAMES` list only what the foundation runs and are
 * pinned by `architecture/foundation-vocabulary.spec.ts`. Declare yours here instead; `queue.module.ts` merges them
 * with the kernel's (`buildJobVocabulary`), binds the result to `JOB_VOCABULARY` and registers every app queue. A key
 * defined twice (here, or here and in the kernel) fails at boot.
 *
 *   export const APP_QUEUE_NAMES = { REPORTS: 'reports' } as const;
 *   export const APP_JOB_NAMES = { ...,  REPORTS: { BUILD: 'report-build' }, BULK_OPS: { REVALIDATE: 'credential-revalidate' } };
 *   export const APP_JOB_DISPLAY_NAMES = { 'report-build': 'Report Build' };
 *   export const APP_JOB_CATEGORIES = { reports: { display: 'Reports', queue: 'reports', requiredIntegration: null, tenantVisible: true } };
 *   export const APP_MANUAL_TYPES = { reports: ['report-build'] };
 *
 * A job is then handled by a `QueueJobHandler` whose `jobNames` lists the name, provided under the queue's
 * `jobHandlersToken`. A new app queue also needs its one dispatcher in `dispatchers/` (one `@Processor` per queue,
 * held by `no-competing-queue-workers.spec.ts`).
 */

/** App queues: constant key to queue name. */
export const APP_QUEUE_NAMES = {} as const satisfies Record<string, string>;

/** App job names, one object per queue, keyed by the queue's constant key (a kernel queue or an `APP_QUEUE_NAMES` key). */
export const APP_JOB_NAMES = {
  NOTIFICATIONS: {},
  WEBHOOKS: {},
  AI_INTERACTIVE: {},
  AI_BACKGROUND: {},
  BULK_OPS: {
    /** The daily re-test of every workspace AI credential (`domains/ai/routing/connect`), sliced to share the lane. */
    AI_CREDENTIAL_REVALIDATE: 'ai-credential-revalidate',
  },
} as const satisfies Record<string, Record<string, string>>;

/** Friendly labels for the app's job types on the super-admin Jobs screens, keyed by job name. */
export const APP_JOB_DISPLAY_NAMES = {
  'ai-credential-revalidate': 'AI Key Revalidation',
} as const satisfies Record<string, string>;

/** App job categories (what a `jobs` row's `category` may hold beside the kernel's). */
export const APP_JOB_CATEGORIES = {} as const satisfies Record<string, JobCategoryDefinition>;

/** App job types that run only on demand (no repeatable schedule), keyed by category. */
export const APP_MANUAL_TYPES = {} as const satisfies Record<string, readonly string[]>;

export const APP_JOB_VOCABULARY: AppJobVocabulary = {
  queueNames: APP_QUEUE_NAMES,
  jobNames: APP_JOB_NAMES,
  displayNames: APP_JOB_DISPLAY_NAMES,
  categories: APP_JOB_CATEGORIES,
  manualTypes: APP_MANUAL_TYPES,
};

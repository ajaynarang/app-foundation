import {
  AI_BACKGROUND_JOB_NAMES,
  AI_INTERACTIVE_JOB_NAMES,
  BULK_OPS_JOB_NAMES,
  EVENTS_JOB_NAMES,
  NOTIFICATIONS_JOB_NAMES,
  QUEUE_NAMES,
  WEBHOOKS_JOB_NAMES,
} from './queue.constants';
import { JOB_CATEGORIES, MANUAL_CATEGORY_TYPES, TYPE_DISPLAY_NAMES } from './job.types';

/**
 * The job vocabulary: the kernel's queues, job names, display names, categories and manual types, merged with the
 * app's own. The kernel lists only what the foundation runs. A product declares its queues and jobs in the app's
 * `platform-glue/queue/job-names.ts`, which is bound to the platform's `JOB_VOCABULARY` token; it never edits the
 * kernel constants (held by `apps/backend/src/architecture/foundation-vocabulary.spec.ts`). A key defined twice
 * fails at boot, held by `__tests__/job-vocabulary.spec.ts`.
 */

export interface JobCategoryDefinition {
  display: string;
  /** The queue name (not the key) this category's jobs run on. */
  queue: string;
  requiredIntegration: string | null;
  tenantVisible: boolean;
}

/** What the app declares in `job-names.ts`. Every map may be empty. */
export interface AppJobVocabulary {
  /** App queues, constant key to queue name, like `QUEUE_NAMES`. */
  queueNames: Readonly<Record<string, string>>;
  /** App job names, one object per queue, keyed by the queue's constant key (kernel or app). */
  jobNames: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Friendly labels for the app's job types, keyed by job name. */
  displayNames: Readonly<Record<string, string>>;
  /** App job categories, keyed by category. */
  categories: Readonly<Record<string, JobCategoryDefinition>>;
  /** Job types with no repeatable schedule, shown as "Manual", keyed by category. */
  manualTypes: Readonly<Record<string, readonly string[]>>;
}

export const EMPTY_APP_JOB_VOCABULARY: AppJobVocabulary = {
  queueNames: {},
  jobNames: {},
  displayNames: {},
  categories: {},
  manualTypes: {},
};

/** The merged vocabulary every reader uses. */
export interface JobVocabulary {
  /** Every queue name, kernel first. */
  queueNames: readonly string[];
  /** Every job name, kernel first. */
  jobNames: readonly string[];
  displayNames: Readonly<Record<string, string>>;
  categories: Readonly<Record<string, JobCategoryDefinition>>;
  allCategories: readonly string[];
  tenantVisibleCategories: readonly string[];
  categoryDisplayNames: Readonly<Record<string, string>>;
  manualTypes: Readonly<Record<string, readonly string[]>>;
}

/** The kernel's job names, one object per queue, keyed by the queue's constant key. */
export const KERNEL_JOB_NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  EVENTS: EVENTS_JOB_NAMES,
  NOTIFICATIONS: NOTIFICATIONS_JOB_NAMES,
  WEBHOOKS: WEBHOOKS_JOB_NAMES,
  AI_INTERACTIVE: AI_INTERACTIVE_JOB_NAMES,
  AI_BACKGROUND: AI_BACKGROUND_JOB_NAMES,
  BULK_OPS: BULK_OPS_JOB_NAMES,
};

const WHERE = 'declare app jobs in apps/backend/src/platform-glue/queue/job-names.ts under a name of their own';

function twice(what: string): Error {
  return new Error(`Job vocabulary: ${what} is defined twice; ${WHERE}.`);
}

export function buildJobVocabulary(app: AppJobVocabulary = EMPTY_APP_JOB_VOCABULARY): JobVocabulary {
  // Queues: key and name are both unique across kernel and app.
  const queueByKey: Record<string, string> = { ...QUEUE_NAMES };
  const queueNames = new Set<string>(Object.values(QUEUE_NAMES));
  for (const [key, name] of Object.entries(app.queueNames)) {
    if (key in queueByKey) throw twice(`queue key "${key}"`);
    if (queueNames.has(name)) throw twice(`queue "${name}"`);
    queueByKey[key] = name;
    queueNames.add(name);
  }

  // Job names: unique across every queue, because display names and schedules key on the name alone.
  const jobNames = new Set<string>();
  for (const names of Object.values(KERNEL_JOB_NAMES)) for (const n of Object.values(names)) jobNames.add(n);
  for (const [queueKey, names] of Object.entries(app.jobNames)) {
    if (!(queueKey in queueByKey)) {
      throw new Error(`Job vocabulary: job names declared for unknown queue key "${queueKey}"; ${WHERE}.`);
    }
    for (const name of Object.values(names)) {
      if (jobNames.has(name)) throw twice(`job name "${name}"`);
      jobNames.add(name);
    }
  }

  const displayNames: Record<string, string> = { ...TYPE_DISPLAY_NAMES };
  for (const [type, label] of Object.entries(app.displayNames)) {
    if (type in displayNames) throw twice(`display name for "${type}"`);
    displayNames[type] = label;
  }

  const categories: Record<string, JobCategoryDefinition> = { ...JOB_CATEGORIES };
  for (const [category, meta] of Object.entries(app.categories)) {
    if (category in categories) throw twice(`category "${category}"`);
    if (!queueNames.has(meta.queue)) {
      throw new Error(`Job vocabulary: category "${category}" names unknown queue "${meta.queue}"; ${WHERE}.`);
    }
    categories[category] = meta;
  }

  const manualTypes: Record<string, string[]> = {};
  for (const [category, types] of Object.entries(MANUAL_CATEGORY_TYPES)) manualTypes[category] = [...types];
  for (const [category, types] of Object.entries(app.manualTypes)) {
    if (!(category in categories)) {
      throw new Error(`Job vocabulary: manual types name unknown category "${category}"; ${WHERE}.`);
    }
    const list = manualTypes[category] ?? [];
    for (const type of types) {
      if (list.includes(type)) throw twice(`manual type "${type}" in category "${category}"`);
      list.push(type);
    }
    manualTypes[category] = list;
  }

  const allCategories = Object.keys(categories);
  return {
    queueNames: [...queueNames],
    jobNames: [...jobNames],
    displayNames,
    categories,
    allCategories,
    tenantVisibleCategories: allCategories.filter((c) => categories[c].tenantVisible),
    categoryDisplayNames: Object.fromEntries(allCategories.map((c) => [c, categories[c].display])),
    manualTypes,
  };
}

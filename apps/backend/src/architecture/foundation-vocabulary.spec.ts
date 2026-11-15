import * as kernelQueue from '@appshore/kernel/infrastructure/queue/queue.constants';
import {
  JOB_CATEGORIES,
  MANUAL_CATEGORY_TYPES,
  TYPE_DISPLAY_NAMES,
} from '@appshore/kernel/infrastructure/queue/job.types';
import { buildJobVocabulary } from '@appshore/kernel/infrastructure/queue/job-vocabulary';
import { APP_JOB_VOCABULARY } from '../platform-glue/queue/job-names';

/**
 * Product vocabulary lives in the app, never in the kernel. The kernel's queues, job names, job labels, categories
 * and manual types are pinned here: a product that adds one to `@appshore/kernel` fails this spec and is pointed at
 * `apps/backend/src/platform-glue/queue/job-names.ts`, where its own queues and jobs belong. A change to the
 * foundation's own list (a new platform job) updates the pinned list below in the same reviewed diff.
 */
const WHERE =
  'App queues and job names go in apps/backend/src/platform-glue/queue/job-names.ts (APP_QUEUE_NAMES, APP_JOB_NAMES, ' +
  'APP_JOB_DISPLAY_NAMES, APP_JOB_CATEGORIES, APP_MANUAL_TYPES), not in @appshore/kernel. A change to the ' +
  "foundation's own list updates the pinned list in foundation-vocabulary.spec.ts.";

const PINNED_QUEUE_NAMES = {
  EVENTS: 'events',
  NOTIFICATIONS: 'notifications',
  WEBHOOKS: 'webhooks',
  AI_INTERACTIVE: 'ai-interactive',
  AI_BACKGROUND: 'ai-background',
  BULK_OPS: 'bulk-ops',
  WHATSAPP: 'whatsapp',
};

const PINNED_JOB_NAMES: Record<string, Record<string, string>> = {
  EVENTS_JOB_NAMES: {},
  NOTIFICATIONS_JOB_NAMES: { CLEANUP: 'cleanup', DIGEST: 'digest' },
  WEBHOOKS_JOB_NAMES: { DELIVER: 'deliver' },
  AI_INTERACTIVE_JOB_NAMES: {},
  AI_BACKGROUND_JOB_NAMES: {},
  BULK_OPS_JOB_NAMES: {
    JOB_CLEANUP: 'job-cleanup',
    DATA_RETENTION: 'data-retention',
    LOGIN_EVENTS_CLEANUP: 'login-events-cleanup',
    TOKENS_CLEANUP: 'tokens-cleanup',
    TRIAL_EXPIRY: 'trial-expiry',
    OPS_HEARTBEAT: 'ops-heartbeat',
    OUTBOX_RELAY: 'outbox-relay',
    DEADLINE_SWEEP: 'deadline-sweep',
  },
};

const PINNED_TYPE_DISPLAY_NAMES = {
  cleanup: 'Notification Cleanup',
  digest: 'Notification Digest',
  deliver: 'Webhook Delivery',
  'job-cleanup': 'Job Cleanup',
  'data-retention': 'Data Retention',
  'login-events-cleanup': 'Login Events Cleanup',
  'tokens-cleanup': 'Tokens Cleanup',
  'trial-expiry': 'Trial Expiry',
  'ops-heartbeat': 'Ops Heartbeat',
  'outbox-relay': 'Outbox Relay',
  'deadline-sweep': 'Deadline Sweep',
};

const PINNED_CATEGORIES = ['events', 'notifications', 'webhooks', 'ai', 'maintenance'];
const PINNED_MANUAL_TYPES = { webhooks: ['deliver'] };

/** Equality with a message that says where the extra entry belongs. */
function expectPinned(actual: unknown, pinned: unknown, what: string): void {
  const a = JSON.stringify(actual, Object.keys(actual as object).sort());
  const p = JSON.stringify(pinned, Object.keys(pinned as object).sort());
  if (a !== p) {
    throw new Error(`${what} changed.\n  pinned: ${p}\n  actual: ${a}\n${WHERE}`);
  }
}

describe('foundation vocabulary: the kernel lists only what the foundation runs', () => {
  it('QUEUE_NAMES equals the pinned list', () => {
    expectPinned(kernelQueue.QUEUE_NAMES, PINNED_QUEUE_NAMES, 'kernel QUEUE_NAMES');
  });

  it('every *_JOB_NAMES constant equals the pinned list, and there is no new one', () => {
    const constants = Object.fromEntries(
      Object.entries(kernelQueue).filter(([key]) => key.endsWith('_JOB_NAMES')),
    ) as Record<string, Record<string, string>>;
    expectPinned(Object.keys(constants).sort(), Object.keys(PINNED_JOB_NAMES).sort(), 'the set of kernel *_JOB_NAMES');
    for (const [name, pinned] of Object.entries(PINNED_JOB_NAMES)) {
      expectPinned(constants[name], pinned, `kernel ${name}`);
    }
  });

  it('TYPE_DISPLAY_NAMES equals the pinned list', () => {
    expectPinned(TYPE_DISPLAY_NAMES, PINNED_TYPE_DISPLAY_NAMES, 'kernel TYPE_DISPLAY_NAMES');
  });

  it('JOB_CATEGORIES and MANUAL_CATEGORY_TYPES equal the pinned lists', () => {
    expectPinned(Object.keys(JOB_CATEGORIES), PINNED_CATEGORIES, 'kernel JOB_CATEGORIES');
    expectPinned(MANUAL_CATEGORY_TYPES, PINNED_MANUAL_TYPES, 'kernel MANUAL_CATEGORY_TYPES');
  });

  it("the app's job-names.ts merges with the kernel without a key defined twice", () => {
    expect(() => buildJobVocabulary(APP_JOB_VOCABULARY)).not.toThrow();
  });

  it('a mismatch names job-names.ts', () => {
    expect(() => expectPinned({ ...PINNED_QUEUE_NAMES, REPORTS: 'reports' }, PINNED_QUEUE_NAMES, 'x')).toThrow(
      /platform-glue\/queue\/job-names\.ts/,
    );
  });
});

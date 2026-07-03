import { QUEUE_NAMES, WEBHOOKS_JOB_NAMES, NOTIFICATIONS_JOB_NAMES, BULK_OPS_JOB_NAMES } from './queue.constants';

// --- Category Metadata (single source of truth) ---

export const JOB_CATEGORIES = {
  events: {
    display: 'Domain Events',
    queue: QUEUE_NAMES.EVENTS,
    requiredIntegration: null,
    tenantVisible: false,
  },
  notifications: {
    display: 'Notifications',
    queue: QUEUE_NAMES.NOTIFICATIONS,
    requiredIntegration: null,
    tenantVisible: false,
  },
  webhooks: {
    display: 'Webhooks',
    queue: QUEUE_NAMES.WEBHOOKS,
    requiredIntegration: null,
    tenantVisible: false,
  },
  ai: {
    display: 'AI',
    queue: QUEUE_NAMES.AI_BACKGROUND,
    requiredIntegration: null,
    tenantVisible: true,
  },
  maintenance: {
    display: 'System Maintenance',
    queue: QUEUE_NAMES.BULK_OPS,
    requiredIntegration: null,
    tenantVisible: false,
  },
} as const;

export type JobCategory = keyof typeof JOB_CATEGORIES;

// Derived arrays (replace old hardcoded lists)
export const ALL_CATEGORIES = Object.keys(JOB_CATEGORIES) as JobCategory[];
export const TENANT_VISIBLE_CATEGORIES = ALL_CATEGORIES.filter((c) => JOB_CATEGORIES[c].tenantVisible);

// --- Type Display Names ---
// Generic display names for the built-in job types. Add app-specific job
// types here so the admin jobs console renders friendly labels.
export const TYPE_DISPLAY_NAMES: Record<string, string> = {
  [NOTIFICATIONS_JOB_NAMES.CLEANUP]: 'Notification Cleanup',
  [NOTIFICATIONS_JOB_NAMES.DIGEST]: 'Notification Digest',
  [WEBHOOKS_JOB_NAMES.DELIVER]: 'Webhook Delivery',
  [BULK_OPS_JOB_NAMES.JOB_CLEANUP]: 'Job Cleanup',
  [BULK_OPS_JOB_NAMES.DATA_RETENTION]: 'Data Retention',
  [BULK_OPS_JOB_NAMES.UPLOADS_CLEANUP]: 'Uploads Cleanup',
  [BULK_OPS_JOB_NAMES.LOGIN_EVENTS_CLEANUP]: 'Login Events Cleanup',
  [BULK_OPS_JOB_NAMES.TOKENS_CLEANUP]: 'Tokens Cleanup',
};

export const CATEGORY_DISPLAY_NAMES: Record<string, string> = Object.fromEntries(
  ALL_CATEGORIES.map((c) => [c, JOB_CATEGORIES[c].display]),
);

// --- Manual-only types (no repeatable schedule) ---

export const MANUAL_CATEGORY_TYPES: Record<string, string[]> = {
  webhooks: [WEBHOOKS_JOB_NAMES.DELIVER],
};

// --- Interfaces ---

export interface CategorySummary {
  category: string;
  displayName: string;
  lastRunAt: string | null;
  todayTotal: number;
  todaySucceeded: number;
  todayFailed: number;
  health: 'healthy' | 'warning' | 'critical';
  types: TypeSummary[];
}

export interface TypeSummary {
  type: string;
  displayName: string;
  lastRunAt: string | null;
  lastRunStatus: 'COMPLETED' | 'FAILED' | 'CANCELLED' | null;
  todayTotal: number;
  todaySucceeded: number;
  todayFailed: number;
  schedule: string | null;
  nextRun: string | null;
}

export interface ScheduledTypeInfo {
  type: string;
  schedule: string;
  nextRun: string | null;
}

export interface JobMetrics {
  totalToday: number;
  successRate: number;
  failedCount: number;
  avgDurationMs: number;
}

export interface PaginatedJobs {
  items: import('@appshore/db').Job[];
  total: number;
  limit: number;
  offset: number;
}

/** Convert a cron pattern or interval to human-readable text */
export function cronToHuman(cron?: string | null, everyMs?: number | null): string {
  if (everyMs) {
    if (everyMs < 60_000) return `Every ${Math.round(everyMs / 1000)}s`;
    if (everyMs < 3_600_000) return `Every ${Math.round(everyMs / 60_000)} min`;
    return `Every ${Math.round(everyMs / 3_600_000)} hours`;
  }

  if (!cron) return 'Manual';

  const parts = cron.split(' ');
  if (parts.length !== 5) return cron;

  const [minute, hour, , ,] = parts;

  if (minute.startsWith('*/') && hour === '*') {
    const n = parseInt(minute.slice(2), 10);
    if (n === 1) return 'Every minute';
    return `Every ${n} min`;
  }

  if (minute === '0' && hour.startsWith('*/')) {
    const n = parseInt(hour.slice(2), 10);
    return `Every ${n} hours`;
  }

  if (minute === '0' && /^\d+$/.test(hour)) {
    const h = parseInt(hour, 10);
    const period = h >= 12 ? 'PM' : 'AM';
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `Daily at ${display} ${period}`;
  }

  return cron;
}

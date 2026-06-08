import {
  QUEUE_NAMES,
  DOCUMENTS_JOB_NAMES,
  VENDOR_DATA_JOB_NAMES,
  WEBHOOKS_JOB_NAMES,
  FINANCE_JOB_NAMES,
} from './queue.constants';

// --- Category Metadata (single source of truth) ---

export const JOB_CATEGORIES = {
  telemetry: {
    display: 'Telemetry',
    queue: QUEUE_NAMES.TELEMETRY,
    requiredIntegration: 'ELD' as const,
    tenantVisible: true,
  },
  safety: {
    display: 'Safety & Compliance',
    queue: QUEUE_NAMES.SAFETY_DETECT,
    requiredIntegration: null,
    tenantVisible: true,
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
  vendor: {
    display: 'Vendor Sync',
    queue: QUEUE_NAMES.VENDOR_DATA,
    requiredIntegration: null,
    tenantVisible: true,
  },
  documents: {
    display: 'Documents',
    queue: QUEUE_NAMES.DOCUMENTS,
    requiredIntegration: null,
    tenantVisible: true,
  },
  geo: {
    display: 'Routing & Geo',
    queue: QUEUE_NAMES.GEO_COMPUTE,
    requiredIntegration: null,
    tenantVisible: true,
  },
  finance: {
    display: 'Finance',
    queue: QUEUE_NAMES.FINANCE,
    requiredIntegration: 'ACCOUNTING' as const,
    tenantVisible: true,
  },
  events: {
    display: 'Domain Events',
    queue: QUEUE_NAMES.EVENTS,
    requiredIntegration: null,
    tenantVisible: false,
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
// Single source of truth lives in @sally/shared-types — shared with the web admin UI.
export { TYPE_DISPLAY_NAMES, CATEGORY_DISPLAY_NAMES } from '@sally/shared-types';

// --- Manual-only types (no repeatable schedule) ---

export const MANUAL_CATEGORY_TYPES: Record<string, string[]> = {
  documents: [DOCUMENTS_JOB_NAMES.RATECON],
  vendor: [VENDOR_DATA_JOB_NAMES.LANES_AUTO_GENERATION, VENDOR_DATA_JOB_NAMES.LANES_RETRY_SINGLE],
  webhooks: [WEBHOOKS_JOB_NAMES.DELIVER],
  finance: [
    FINANCE_JOB_NAMES.INVOICE,
    FINANCE_JOB_NAMES.SETTLEMENT,
    FINANCE_JOB_NAMES.PAYMENT,
    FINANCE_JOB_NAMES.SETTLEMENT_PAYMENT,
    FINANCE_JOB_NAMES.WEBHOOK_PAYMENT,
    FINANCE_JOB_NAMES.WEBHOOK_BILL_PAYMENT,
    FINANCE_JOB_NAMES.INITIAL_SYNC,
  ],
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
  items: import('@prisma/client').Job[];
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

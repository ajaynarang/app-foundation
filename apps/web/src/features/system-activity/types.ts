export type {
  JobStatus,
  HealthStatus,
  Job,
  TypeSummary,
  CategorySummary,
  JobMetrics,
  PaginatedJobs,
} from '@sally/shared-types';

// Display-name maps are the single source of truth in @sally/shared-types — re-exported here
// so existing call sites (recent-failures, schedule-manager, job-detail-sheet, etc.) keep working.
export { TYPE_DISPLAY_NAMES, CATEGORY_DISPLAY_NAMES } from '@sally/shared-types';

// URL-safe category slugs (category names are already URL-safe → identity map).
// Keys mirror the backend `JOB_CATEGORIES` keys; `SLUG_TO_CATEGORY` is derived,
// so an identity map guarantees the slug round-trips back to the API filter value.
export const CATEGORY_SLUGS: Record<string, string> = {
  telemetry: 'telemetry',
  safety: 'safety',
  notifications: 'notifications',
  webhooks: 'webhooks',
  vendor: 'vendor',
  documents: 'documents',
  geo: 'geo',
  finance: 'finance',
  events: 'events',
  maintenance: 'maintenance',
};

export const SLUG_TO_CATEGORY: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_SLUGS).map(([k, v]) => [v, k]),
);

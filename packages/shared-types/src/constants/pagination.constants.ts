/**
 * Pagination defaults and safety limits.
 * Used across analytics queries, list endpoints, and timeline fetches.
 */

/** Hard cap for analytics/reporting queries to prevent runaway scans */
export const QUERY_SAFETY_LIMIT = 10_000;

/** Default list sizes by context */
export const DEFAULT_PAGE_SIZE = 20;
export const DEFAULT_TIMELINE_LIMIT = 50;
export const DEFAULT_ALERT_LIMIT = 20;
export const DEFAULT_ALERT_LIST_LIMIT = 500;
export const DEFAULT_SUPPORT_TICKET_LIMIT = 50;
export const DEFAULT_MONITORING_LIMIT = 100;

/**
 * Centralized semantic color tokens — single source of truth.
 *
 * Palette: Primary (black/white) | Info (blue) | Caution (yellow) | Critical (red)
 * Principle: Neutral-first — healthy/normal states get NO color.
 */

// ---------------------------------------------------------------------------
// Base semantic color classes
// ---------------------------------------------------------------------------
export const SEMANTIC_COLORS = {
  neutral: {
    text: 'text-muted-foreground',
    bg: 'bg-muted',
    border: 'border-border',
    borderL: 'border-l-border',
    dot: 'bg-muted-foreground',
  },
  info: {
    text: 'text-info',
    bg: 'bg-info/10',
    border: 'border-info/20',
    borderL: 'border-l-info',
    dot: 'bg-info',
  },
  caution: {
    text: 'text-caution',
    bg: 'bg-caution/10',
    border: 'border-caution/20',
    borderL: 'border-l-caution',
    dot: 'bg-caution',
  },
  critical: {
    text: 'text-critical',
    bg: 'bg-critical/10',
    border: 'border-critical/20',
    borderL: 'border-l-critical',
    dot: 'bg-critical',
  },
} as const;

export type SemanticColor = keyof typeof SEMANTIC_COLORS;

// ---------------------------------------------------------------------------
// Alert severity → semantic color
// ---------------------------------------------------------------------------
export function getSeverityColor(severity: string): SemanticColor {
  switch (severity?.toLowerCase()) {
    case 'critical':
      return 'critical';
    case 'high':
    case 'warning':
      return 'caution';
    default:
      return 'neutral';
  }
}

// ---------------------------------------------------------------------------
// Document status → semantic color
// ---------------------------------------------------------------------------
export function getDocStatusColor(status: string): SemanticColor {
  switch (status?.toLowerCase()) {
    case 'missing':
    case 'overdue':
    case 'expired':
      return 'caution';
    case 'blocked':
      return 'critical';
    default:
      return 'neutral';
  }
}

// ---------------------------------------------------------------------------
// Invoice / payment status → semantic color
// ---------------------------------------------------------------------------
export function getInvoiceStatusColor(status: string): SemanticColor {
  switch (status?.toLowerCase()) {
    case 'overdue':
    case 'past_due':
    case 'recoursed':
      return 'critical';
    case 'pending':
    case 'due_soon':
      return 'caution';
    case 'sent':
    case 'approved':
      return 'info';
    default:
      return 'neutral';
  }
}

// ---------------------------------------------------------------------------
// Integration status → semantic color
// ---------------------------------------------------------------------------
export function getIntegrationStatusColor(status: string): SemanticColor {
  switch (status?.toUpperCase()) {
    case 'ERROR':
    case 'DISCONNECTED':
      return 'critical';
    case 'CONFIGURED':
    case 'PENDING':
      return 'caution';
    case 'ACTIVE':
    case 'CONNECTED':
      return 'info';
    default:
      return 'neutral';
  }
}

// ---------------------------------------------------------------------------
// Sync freshness → semantic color
// ---------------------------------------------------------------------------
export function getSyncFreshnessColor(lastSyncDate: Date | string | null): SemanticColor {
  if (!lastSyncDate) return 'neutral';
  const diffMs = Date.now() - new Date(lastSyncDate).getTime();
  const diffMin = diffMs / 60000;
  if (diffMin > 30) return 'critical';
  if (diffMin > 5) return 'caution';
  return 'neutral';
}

// ---------------------------------------------------------------------------
// Aging bucket → semantic color
// ---------------------------------------------------------------------------
export function getAgingColor(bucket: string): SemanticColor {
  if (bucket.includes('90') || bucket.includes('120')) return 'critical';
  if (bucket.includes('60')) return 'caution';
  return 'neutral';
}

// ---------------------------------------------------------------------------
// Generic freshness based on minutes since event
// ---------------------------------------------------------------------------
export function getFreshnessColor(minutesSince: number): SemanticColor {
  if (minutesSince >= 5) return 'critical';
  if (minutesSince >= 2) return 'caution';
  return 'neutral';
}

// ---------------------------------------------------------------------------
// Job status → semantic color
// ---------------------------------------------------------------------------
export function getJobStatusColor(status: string): SemanticColor {
  switch (status?.toLowerCase()) {
    case 'failed':
      return 'critical';
    case 'processing':
    case 'queued':
      return 'info';
    default:
      return 'neutral';
  }
}

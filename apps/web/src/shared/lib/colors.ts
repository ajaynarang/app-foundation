/**
 * Centralized semantic color tokens — single source of truth.
 *
 * Palette: Primary (black/white) | Info (blue) | Caution (yellow) | Critical (red)
 * Principle: Neutral-first — healthy/normal states get NO color.
 *
 * @see .docs/plans/2026-03-17-color-theming-standardization-design.md
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
// Load status → semantic color
// ---------------------------------------------------------------------------
export function getLoadStatusColor(status: string): SemanticColor {
  switch (status) {
    case 'ASSIGNED':
    case 'DISPATCHED':
    case 'IN_TRANSIT':
      return 'info';
    case 'ON_HOLD':
      return 'caution';
    case 'overdue':
      return 'critical';
    default:
      return 'neutral';
  }
}

// ---------------------------------------------------------------------------
// Alert / Shield severity → semantic color
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
// Shield status → semantic color
// ---------------------------------------------------------------------------
export function getShieldStatusColor(status: string): SemanticColor {
  switch (status?.toUpperCase()) {
    case 'VULNERABLE':
      return 'critical';
    case 'AT_RISK':
      return 'caution';
    default:
      return 'neutral';
  }
}

// ---------------------------------------------------------------------------
// HOS ratio → semantic color (neutral-first)
// ---------------------------------------------------------------------------
export function getHOSColor(ratio: number): SemanticColor {
  if (ratio >= 0.9) return 'critical';
  if (ratio >= 0.75) return 'caution';
  return 'neutral';
}

// ---------------------------------------------------------------------------
// HOS remaining hours → semantic color (neutral-first)
// ---------------------------------------------------------------------------
export function getHOSRemainingColor(hoursRemaining: number): SemanticColor {
  if (hoursRemaining < 2) return 'critical';
  if (hoursRemaining < 4) return 'caution';
  return 'neutral';
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
// Settlement status → semantic color
// ---------------------------------------------------------------------------
export function getSettlementStatusColor(status: string): SemanticColor {
  switch (status?.toLowerCase()) {
    case 'pending_review':
    case 'pending_approval':
      return 'caution';
    case 'approved':
    case 'processing':
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

// ---------------------------------------------------------------------------
// IFTA filing status → semantic color
// ---------------------------------------------------------------------------
export function getIftaFilingStatusColor(status: string): SemanticColor {
  switch (status) {
    case 'FILED':
    case 'CONFIRMED':
      return 'info';
    case 'REVIEWED':
    case 'DRAFT':
      return 'caution';
    case 'OPEN':
    case 'CALCULATING':
      return 'neutral';
    case 'AMENDED':
      return 'caution';
    default:
      return 'neutral';
  }
}

// ---------------------------------------------------------------------------
// IFTA net liability → semantic color
// ---------------------------------------------------------------------------
export function getIftaLiabilityColor(netCents: number): SemanticColor {
  if (netCents > 0) return 'critical'; // Owes money
  if (netCents < 0) return 'info'; // Refund
  return 'neutral'; // Zero
}

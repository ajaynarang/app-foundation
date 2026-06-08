/**
 * Billing feature display utilities.
 *
 * NOTE: For general currency formatting, prefer `formatCents` from
 * `@/shared/lib/utils/formatters` which uses Intl.NumberFormat.
 * These helpers are specific to billing status display logic.
 */

/**
 * Get badge variant for billing invoice status.
 */
export function getInvoiceStatusVariant(status: string): 'default' | 'muted' | 'destructive' | 'outline' {
  switch (status) {
    case 'PAID':
      return 'default';
    case 'OPEN':
      return 'muted';
    case 'VOID':
    case 'UNCOLLECTIBLE':
    case 'DRAFT':
      return 'outline';
    default:
      return 'destructive';
  }
}

/**
 * Get badge variant for wallet transaction type.
 */
export function getTransactionTypeVariant(type: string): 'default' | 'muted' | 'destructive' | 'outline' {
  switch (type) {
    case 'TOP_UP':
    case 'AUTO_RELOAD':
      return 'default';
    case 'OVERAGE_DEDUCTION':
      return 'destructive';
    case 'ADMIN_CREDIT':
      return 'muted';
    case 'REFUND':
      return 'outline';
    default:
      return 'outline';
  }
}

/**
 * Get usage meter color class based on percentage consumed.
 * green <60%, yellow 60-80%, red >80%
 */
export function getUsageColor(used: number, limit: number): string {
  if (!limit) return 'bg-green-500';
  const pct = (used / limit) * 100;
  if (pct >= 80) return 'bg-red-500';
  if (pct >= 60) return 'bg-yellow-500';
  return 'bg-green-500';
}

/**
 * Format wallet transaction type for display.
 */
export function formatTransactionType(type: string): string {
  const map: Record<string, string> = {
    TOP_UP: 'Top Up',
    OVERAGE_DEDUCTION: 'Overage',
    ADMIN_CREDIT: 'Credit',
    REFUND: 'Refund',
    AUTO_RELOAD: 'Auto-Reload',
  };
  return map[type] ?? type;
}

/**
 * Format invoice status for display.
 */
export function formatInvoiceStatus(status: string): string {
  const map: Record<string, string> = {
    DRAFT: 'Draft',
    OPEN: 'Open',
    PAID: 'Paid',
    VOID: 'Void',
    UNCOLLECTIBLE: 'Uncollectible',
  };
  return map[status] ?? status;
}

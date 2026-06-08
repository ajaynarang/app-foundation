'use client';

import { Badge } from '@sally/ui/components/ui/badge';

const statusConfig: Record<string, { label: string; variant: 'default' | 'destructive' | 'outline' | 'muted' }> = {
  PENDING_DOCUMENTS: { label: 'Needs Docs', variant: 'outline' },
  READY_FOR_REVIEW: { label: 'Ready', variant: 'muted' },
  APPROVED: { label: 'Approved', variant: 'default' },
  INVOICED: { label: 'Invoiced', variant: 'default' },
};

export function BillingStatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  const config = statusConfig[status] ?? {
    label: status,
    variant: 'outline' as const,
  };
  return <Badge variant={overdue ? 'destructive' : config.variant}>{config.label}</Badge>;
}

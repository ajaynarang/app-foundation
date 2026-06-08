'use client';

import { Badge } from '@sally/ui/components/ui/badge';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import { useCustomerPaymentStats } from '../hooks/use-invoices';
import { formatCents } from '@/shared/lib/utils/formatters';

interface CustomerPaymentStatsProps {
  customerId?: string;
}

const reliabilityColors: Record<string, string> = {
  Excellent: `${SEMANTIC_COLORS.neutral.bg} ${SEMANTIC_COLORS.neutral.text}`,
  Good: `${SEMANTIC_COLORS.neutral.bg} ${SEMANTIC_COLORS.neutral.text}`,
  Average: `${SEMANTIC_COLORS.caution.bg} ${SEMANTIC_COLORS.caution.text}`,
  Slow: `${SEMANTIC_COLORS.critical.bg} ${SEMANTIC_COLORS.critical.text}`,
};

export function CustomerPaymentStats({ customerId }: CustomerPaymentStatsProps) {
  const { data: stats, isLoading } = useCustomerPaymentStats(customerId);

  if (!customerId) return null;

  if (isLoading) {
    return <Skeleton className="h-5 w-32 inline-block" />;
  }

  if (!stats || !stats.hasHistory) {
    return <span className="text-xs text-muted-foreground">New customer</span>;
  }

  const colorClass =
    reliabilityColors[stats.reliabilityLabel ?? ''] ?? `${SEMANTIC_COLORS.neutral.bg} ${SEMANTIC_COLORS.neutral.text}`;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <Badge className={`text-2xs px-1.5 py-0 ${colorClass}`}>Avg {stats.avgDaysToPay ?? 0}d</Badge>
      {stats.outstandingCount != null && stats.outstandingCount > 0 ? (
        <span className="text-muted-foreground">
          {stats.outstandingCount} outstanding ({formatCents(stats.outstandingCents ?? 0)})
        </span>
      ) : null}
    </span>
  );
}

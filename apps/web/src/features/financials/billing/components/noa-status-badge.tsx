'use client';

import { Badge } from '@sally/ui/components/ui/badge';
import type { NoaStatus } from '../types';

const NOA_STATUS_STYLES: Record<NoaStatus, string> = {
  NOT_SENT: 'bg-muted text-muted-foreground border-border',
  SENT: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  ACKNOWLEDGED: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  REJECTED: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const NOA_STATUS_LABELS: Record<NoaStatus, string> = {
  NOT_SENT: 'Not Sent',
  SENT: 'Sent',
  ACKNOWLEDGED: 'Acknowledged',
  REJECTED: 'Rejected',
};

interface NoaStatusBadgeProps {
  status: NoaStatus;
  className?: string;
}

export function NoaStatusBadge({ status, className }: NoaStatusBadgeProps) {
  return (
    <Badge className={`text-xs ${NOA_STATUS_STYLES[status]} ${className ?? ''}`}>{NOA_STATUS_LABELS[status]}</Badge>
  );
}

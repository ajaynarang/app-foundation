'use client';

import { Badge } from '@sally/ui/components/ui/badge';
import type { TrailerStatus } from '../types';

const STATUS_CONFIG: Record<
  TrailerStatus,
  { label: string; className: string; variant: 'default' | 'outline' | 'destructive' | 'muted' }
> = {
  AVAILABLE: { label: 'Available', className: '', variant: 'muted' },
  ASSIGNED: { label: 'Assigned', className: 'bg-blue-500/10 text-blue-500 border-transparent', variant: 'default' },
  AT_SHIPPER: {
    label: 'At Shipper',
    className: 'bg-yellow-500/10 text-yellow-500 border-transparent',
    variant: 'default',
  },
  AT_RECEIVER: {
    label: 'At Receiver',
    className: 'bg-yellow-500/10 text-yellow-500 border-transparent',
    variant: 'default',
  },
  IN_SHOP: { label: 'In Shop', className: 'bg-yellow-500/10 text-yellow-500 border-transparent', variant: 'default' },
  OUT_OF_SERVICE: { label: 'Out of Service', className: '', variant: 'destructive' },
};

interface TrailerStatusBadgeProps {
  status: TrailerStatus;
}

export function TrailerStatusBadge({ status }: TrailerStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || { label: status, className: '', variant: 'outline' as const };

  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  );
}

'use client';

import { Badge } from '@sally/ui/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Clock, Ban } from 'lucide-react';
import type { JobStatus } from '../types';

const STATUS_CONFIG: Record<
  JobStatus,
  { label: string; variant: 'default' | 'muted' | 'destructive' | 'outline'; icon: React.ElementType }
> = {
  QUEUED: { label: 'Queued', variant: 'muted', icon: Clock },
  PROCESSING: { label: 'Processing', variant: 'default', icon: Loader2 },
  COMPLETED: { label: 'Completed', variant: 'outline', icon: CheckCircle2 },
  FAILED: { label: 'Failed', variant: 'destructive', icon: XCircle },
  CANCELLED: { label: 'Cancelled', variant: 'muted', icon: Ban },
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className={`h-3 w-3 ${status === 'PROCESSING' ? 'animate-spin' : ''}`} />
      {config.label}
    </Badge>
  );
}

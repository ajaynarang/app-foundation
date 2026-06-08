'use client';

import { Check } from 'lucide-react';
import { cn } from '@sally/ui';
import { LEG_STATUS_VARIANTS } from '../constants/relay';
import type { LoadLegStatus } from '@sally/shared-types';

export interface LegStatusPillProps {
  sequence: number;
  status: string;
  driverName?: string | null;
  /** Compact mode for kanban cards (no driver name) */
  compact?: boolean;
}

export function LegStatusPill({ sequence, status, driverName, compact = false }: LegStatusPillProps) {
  const variant = LEG_STATUS_VARIANTS[status as LoadLegStatus] ?? LEG_STATUS_VARIANTS.PENDING;

  const isDelivered = status === 'DELIVERED';
  const isActive = status === 'IN_TRANSIT';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium leading-tight',
        variant.pillClass,
      )}
    >
      <span className="font-semibold">L{sequence}</span>

      {isDelivered && <Check className="h-2.5 w-2.5" />}

      {!compact && !isDelivered && <span>{variant.label}</span>}

      {isActive && <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />}

      {!compact && driverName && <span className="ml-0.5 text-muted-foreground">{driverName}</span>}
    </span>
  );
}

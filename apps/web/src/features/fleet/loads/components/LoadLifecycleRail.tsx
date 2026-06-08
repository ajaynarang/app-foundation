'use client';

import { useMemo } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@sally/ui';
import type { LoadWithInvoices } from '@/features/fleet/loads/utils/load-invoice';
import { hasInvoice, getLoadInvoice } from '@/features/fleet/loads/utils/load-invoice';

interface LifecycleStep {
  key: string;
  label: string;
  completedAt?: string | null;
  status: 'completed' | 'active' | 'upcoming';
}

function getLifecycleSteps(load: LoadWithInvoices): LifecycleStep[] {
  const steps: LifecycleStep[] = [];

  // Step 1: Booked — always completed if load exists
  steps.push({
    key: 'booked',
    label: 'Booked',
    completedAt: load.createdAt,
    status: 'completed',
  });

  // Step 2: Assigned
  const isAssigned = !!load.assignedAt || ['ASSIGNED', 'IN_TRANSIT', 'DELIVERED'].includes(load.status);
  steps.push({
    key: 'assigned',
    label: 'Assigned',
    completedAt: load.assignedAt,
    status: isAssigned ? 'completed' : load.status === 'PENDING' ? 'active' : 'upcoming',
  });

  // Step 3: In Transit
  const isInTransit = !!load.inTransitAt || ['IN_TRANSIT', 'DELIVERED'].includes(load.status);
  steps.push({
    key: 'in_transit',
    label: 'In Transit',
    completedAt: load.inTransitAt,
    status: isInTransit ? (load.status === 'IN_TRANSIT' ? 'active' : 'completed') : 'upcoming',
  });

  // Step 4: Delivered
  const isDelivered = !!load.deliveredAt || load.status === 'DELIVERED';
  steps.push({
    key: 'delivered',
    label: 'Delivered',
    completedAt: load.deliveredAt,
    status: isDelivered ? (hasInvoice(load) ? 'completed' : 'active') : 'upcoming',
  });

  // Step 5: Invoiced — only show if load is delivered or has invoice
  const invoice = getLoadInvoice(load);
  const isInvoiced = !!invoice;
  const isPaid = invoice?.status === 'PAID';

  if (isDelivered || isInvoiced) {
    steps.push({
      key: 'invoiced',
      label: 'Invoiced',
      completedAt: isInvoiced ? (invoice?.createdAt ?? null) : null,
      status: isInvoiced ? (isPaid ? 'completed' : 'active') : 'upcoming',
    });

    // Step 6: Paid
    steps.push({
      key: 'paid',
      label: 'Paid',
      completedAt: isPaid ? (invoice?.paidDate ?? null) : null,
      status: isPaid ? 'completed' : 'upcoming',
    });
  }

  return steps;
}

/** Statuses where the lifecycle rail is shown */
const RAIL_ELIGIBLE_STATUSES = ['PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED'];

export function LoadLifecycleRail({ load }: { load: LoadWithInvoices }) {
  const steps = useMemo(() => getLifecycleSteps(load), [load]);

  // Don't show for draft, cancelled, tonu, on_hold
  if (
    !RAIL_ELIGIBLE_STATUSES.includes(load.status) &&
    load.billingStatus !== 'INVOICED' &&
    load.billingStatus !== 'PAID'
  ) {
    return null;
  }

  return (
    <div className="py-4 border-b border-border bg-gradient-to-b from-muted/30 to-transparent">
      <div className="flex items-center">
        {steps.map((step, i) => (
          <div key={step.key} className="contents">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'h-6 w-6 rounded-full flex items-center justify-center text-2xs font-bold transition-all',
                  step.status === 'completed' && 'bg-foreground text-background shadow-sm shadow-foreground/30',
                  step.status === 'active' &&
                    'bg-foreground text-background shadow-sm shadow-foreground/30 animate-pulse',
                  step.status === 'upcoming' && 'bg-background border-2 border-border text-muted-foreground',
                )}
              >
                {step.status === 'completed' ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span
                className={cn(
                  'mt-1 text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap',
                  step.status === 'completed' && 'text-foreground',
                  step.status === 'active' && 'text-foreground',
                  step.status === 'upcoming' && 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
              {step.completedAt && step.status === 'completed' && (
                <span className="text-[8px] text-muted-foreground tabular-nums">
                  {new Date(step.completedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              )}
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  'flex-1 h-0.5 min-w-3 mx-1 -mt-4',
                  step.status === 'completed' && steps[i + 1].status !== 'upcoming' && 'bg-foreground',
                  step.status === 'active' && 'bg-gradient-to-r from-foreground to-border',
                  step.status === 'upcoming' && 'bg-border',
                  step.status === 'completed' && steps[i + 1].status === 'upcoming' && 'bg-border',
                )}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { Layers, Check, Truck } from 'lucide-react';
import { cn } from '@sally/ui';
import type { DriverTrip } from '@/features/fleet/drivers/hooks/use-driver-home';

interface TripSequenceBannerProps {
  trip: DriverTrip;
}

/**
 * Driver-facing view of a multi-load trip: the loads the dispatcher grouped for
 * this driver, shown in sequence with the current load highlighted. Tapping a
 * load opens its detail. Only rendered when the driver's active work is a 2+ load
 * trip — a solo load keeps the normal single-load view.
 */
export function TripSequenceBanner({ trip }: TripSequenceBannerProps) {
  const router = useRouter();
  const currentIndex = trip.loads.findIndex((l) => l.isCurrent);

  return (
    <section
      className="rounded-2xl border border-border bg-card p-3 space-y-3"
      aria-label={`Trip ${trip.tripId} with ${trip.loadCount} loads`}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
          <Layers className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground leading-tight">Your trip today</p>
          <p className="text-xs text-muted-foreground truncate">
            {trip.loadCount} loads in sequence
            {currentIndex >= 0 ? ` · on load ${currentIndex + 1} of ${trip.loadCount}` : ''}
          </p>
        </div>
      </div>

      <ol className="space-y-1.5">
        {trip.loads.map((load, i) => {
          const done = load.status === 'DELIVERED' || load.status === 'COMPLETED';
          return (
            <li key={load.loadNumber}>
              <button
                type="button"
                onClick={() => load.loadNumber && router.push(`/driver/me/loads/${load.loadNumber}`)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors min-h-[44px]',
                  load.isCurrent
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-background hover:bg-accent/50 dark:hover:bg-gray-800/50',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold shrink-0',
                    done
                      ? 'bg-primary text-primary-foreground'
                      : load.isCurrent
                        ? 'bg-primary/15 text-primary'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-foreground truncate">
                      {load.originCity}, {load.originState} → {load.destinationCity}, {load.destinationState}
                    </span>
                    {load.isCurrent && (
                      <span className="flex items-center gap-0.5 text-[10px] font-semibold text-primary shrink-0">
                        <Truck className="h-3 w-3" /> Now
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] text-muted-foreground truncate">
                    {load.customerName ?? '—'} · {load.status?.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

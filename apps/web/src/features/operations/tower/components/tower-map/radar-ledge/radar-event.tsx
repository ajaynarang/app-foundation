'use client';

import { cn } from '@sally/ui';

interface RadarEventProps {
  kind: 'pickup' | 'delivery';
  loadNumber: string;
  driverName: string;
  city: string | null;
  state: string | null;
  appointmentAt: string;
  leftPct: number;
}

/**
 * Single dot on the radar ledge with a tooltip. Positioned absolutely along
 * the 4-hour strip.
 */
export function RadarEvent({ kind, loadNumber, driverName, city, state, appointmentAt, leftPct }: RadarEventProps) {
  const time = new Date(appointmentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const loc = [city, state].filter(Boolean).join(', ') || 'Unknown';
  const tooltip = `${kind === 'pickup' ? 'Pickup' : 'Delivery'} ${time} · ${driverName} · ${loadNumber} · ${loc}`;
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2 top-1/2" style={{ left: `${leftPct}%` }} title={tooltip}>
      <span
        aria-label={tooltip}
        className={cn(
          'block h-2 w-2 rounded-full border border-background',
          kind === 'pickup' ? 'bg-blue-500 dark:bg-blue-400' : 'bg-emerald-500 dark:bg-emerald-400',
        )}
      />
    </div>
  );
}

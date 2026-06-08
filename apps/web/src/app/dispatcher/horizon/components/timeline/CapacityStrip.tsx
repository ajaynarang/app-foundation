import { cn } from '@sally/ui';
import { parseISO, isToday } from 'date-fns';
import type { HorizonDriverRow } from '@/features/horizon/types';

interface CapacityStripProps {
  drivers: HorizonDriverRow[];
  dayStrings: string[];
}

export function CapacityStrip({ drivers, dayStrings }: CapacityStripProps) {
  const total = drivers.length;
  if (total === 0) return null;

  return (
    <div className="grid grid-cols-[220px_repeat(7,1fr)] gap-px">
      <div className="px-3 py-1 text-2xs text-muted-foreground">Capacity</div>
      {dayStrings.map((dayStr) => {
        let loaded = 0;
        for (const driver of drivers) {
          const day = driver.days[dayStr];
          if (!day) continue;
          const hasLoad = day.loads.length > 0;
          // Check if spanned by a multi-day load
          const isSpanned = Object.values(driver.days).some((d) =>
            d.loads.some((l) => dayStr >= l.pickupDate && dayStr <= l.deliveryDate),
          );
          if (hasLoad || isSpanned) loaded++;
        }
        const pct = Math.round((loaded / total) * 100);

        const isTodayCol = isToday(parseISO(dayStr));

        return (
          <div key={dayStr} className={cn('flex items-center gap-1 px-2 py-1', isTodayCol && 'bg-primary/[0.03]')}>
            <div className="h-1.5 flex-1 rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  pct >= 80 ? 'bg-primary' : pct >= 50 ? 'bg-primary/60' : 'bg-primary/30',
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-2xs text-muted-foreground">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

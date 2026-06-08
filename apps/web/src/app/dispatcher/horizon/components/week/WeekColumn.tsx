import { cn } from '@sally/ui';
import { format, parseISO, isToday } from 'date-fns';
import type { HorizonDriverRow } from '@/features/horizon/types';
import { WeekCard } from './WeekCard';

interface WeekColumnProps {
  dayStr: string;
  drivers: HorizonDriverRow[];
}

export function WeekColumn({ dayStr, drivers }: WeekColumnProps) {
  const date = parseISO(dayStr);
  const today = isToday(date);
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;

  // Count loaded vs total
  let loaded = 0;
  for (const driver of drivers) {
    const day = driver.days[dayStr];
    if (!day) continue;
    const hasLoad =
      day.loads.length > 0 ||
      Object.values(driver.days).some((d) => d.loads.some((l) => dayStr >= l.pickupDate && dayStr <= l.deliveryDate));
    if (hasLoad) loaded++;
  }

  return (
    <div className={cn('flex flex-col rounded-xl border border-border bg-card', isWeekend && 'opacity-70')}>
      <div
        className={cn(
          'flex items-center justify-between border-b border-border px-3 py-2',
          today && 'bg-primary/5 dark:bg-primary/10',
        )}
      >
        <div>
          <div className={cn('text-sm font-medium', today ? 'text-primary' : 'text-foreground')}>
            {format(date, 'EEE')}
          </div>
          <div className="text-2xs text-muted-foreground">{format(date, 'MMM d')}</div>
        </div>
        <div className="text-2xs text-muted-foreground">
          {loaded}/{drivers.length}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2">
        {drivers.map((driver) => {
          const day = driver.days[dayStr];
          if (!day) return null;
          return <WeekCard key={driver.driverId} driver={driver} dayData={day} />;
        })}
      </div>
    </div>
  );
}

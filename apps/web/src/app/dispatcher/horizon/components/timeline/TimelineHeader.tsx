import { cn } from '@sally/ui';
import { format, parseISO, isToday } from 'date-fns';

interface TimelineHeaderProps {
  dayStrings: string[];
}

export function TimelineHeader({ dayStrings }: TimelineHeaderProps) {
  return (
    <div className="grid grid-cols-[220px_repeat(7,1fr)] gap-px border-b border-border bg-card">
      <div className="px-3 py-2 text-xs font-medium text-muted-foreground">Driver</div>
      {dayStrings.map((dayStr) => {
        const date = parseISO(dayStr);
        const today = isToday(date);
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;

        return (
          <div
            key={dayStr}
            className={cn(
              'px-2 py-2 text-center text-xs',
              today && 'text-primary font-semibold bg-primary/[0.03]',
              !today && 'text-muted-foreground font-medium',
              isWeekend && !today && 'opacity-50',
            )}
          >
            <div>{format(date, 'EEE')}</div>
            <div className="text-2xs">{format(date, 'MMM d')}</div>
          </div>
        );
      })}
    </div>
  );
}

'use client';

import { Button } from '@sally/ui/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface HorizonWeekNavProps {
  weekLabel: string;
  isCurrentWeek: boolean;
  onNavigateWeek: (direction: 'prev' | 'next' | 'today') => void;
}

/**
 * Week navigator for the Horizon filter row — Horizon's date-scope control (prev/next
 * week + jump to today). Sits in Zone 3 alongside search and the view switcher.
 */
export function HorizonWeekNav({ weekLabel, isCurrentWeek, onNavigateWeek }: HorizonWeekNavProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onNavigateWeek('prev')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2 text-xs font-medium text-muted-foreground">
          {isCurrentWeek ? 'This Week' : weekLabel.split(' – ')[0]}
        </span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onNavigateWeek('next')}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {!isCurrentWeek && (
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onNavigateWeek('today')}>
          Today
        </Button>
      )}
    </div>
  );
}

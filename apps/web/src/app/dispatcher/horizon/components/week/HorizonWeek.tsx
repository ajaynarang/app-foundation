'use client';

import type { HorizonResponse } from '@/features/horizon/types';
import { WeekColumn } from './WeekColumn';

interface HorizonWeekProps {
  data: HorizonResponse;
  dayStrings: string[];
}

export function HorizonWeek({ data, dayStrings }: HorizonWeekProps) {
  // Show all 7 days but make weekends narrower
  return (
    <div className="grid grid-cols-7 gap-2">
      {dayStrings.map((dayStr) => (
        <WeekColumn key={dayStr} dayStr={dayStr} drivers={data.drivers} />
      ))}
    </div>
  );
}

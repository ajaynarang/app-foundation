'use client';

import { cn } from '@sally/ui';
import { Truck } from 'lucide-react';
import { useMemo } from 'react';
import { parseISO, isToday } from 'date-fns';
import type { HorizonDriverRow, HorizonLoadBlock, SallySuggestion } from '@/features/horizon/types';
import { LoadBlock } from './LoadBlock';
import { SuggestionBlock } from './SuggestionBlock';
import { UnavailBlock } from './UnavailBlock';
import { OpenSlot } from './OpenSlot';

interface TimelineDriverRowProps {
  driver: HorizonDriverRow;
  dayStrings: string[];
  suggestions: SallySuggestion[];
  onAcceptSuggestion: (suggestion: SallySuggestion) => void;
  onDismissSuggestion: (suggestionId: string) => void;
  onDeleteDriverUnavail?: (id: number) => void;
  onDeleteVehicleUnavail?: (id: number) => void;
  onOpenSlotClick?: (driverId: number, dayStr: string) => void;
  onLoadClick?: (loadId: string) => void;
}

interface PlacedLoad {
  load: HorizonLoadBlock;
  colStart: number; // 0-indexed day column
  colSpan: number;
  lane: number; // vertical lane (0 = first row, 1 = second, etc.)
}

/**
 * Assign loads to non-overlapping vertical lanes (like calendar event rows).
 * Each lane is a horizontal track; loads are placed in the first lane
 * where they don't overlap with existing loads.
 */
function layoutLoads(allLoads: HorizonLoadBlock[], dayStrings: string[]): PlacedLoad[] {
  const placed: PlacedLoad[] = [];
  // Track which columns each lane occupies
  const lanes: Set<number>[] = [];

  // Sort by pickup date, then by span length (longer first)
  const sorted = [...allLoads].sort((a, b) => {
    if (a.pickupDate !== b.pickupDate) return a.pickupDate < b.pickupDate ? -1 : 1;
    const spanA = dayStrings.indexOf(a.deliveryDate) - dayStrings.indexOf(a.pickupDate);
    const spanB = dayStrings.indexOf(b.deliveryDate) - dayStrings.indexOf(b.pickupDate);
    return spanB - spanA; // longer spans first
  });

  for (const load of sorted) {
    const startIdx = dayStrings.indexOf(load.pickupDate);
    if (startIdx < 0) continue;

    let endIdx = dayStrings.indexOf(load.deliveryDate);
    if (endIdx < 0) endIdx = dayStrings.length - 1; // extends past week
    if (endIdx < startIdx) endIdx = startIdx;

    const colStart = startIdx;
    const colSpan = endIdx - startIdx + 1;
    const occupiedCols = Array.from({ length: colSpan }, (_, i) => colStart + i);

    // Find first lane with no overlap
    let lane = 0;
    while (true) {
      if (!lanes[lane]) {
        lanes[lane] = new Set();
        break;
      }
      const hasOverlap = occupiedCols.some((c) => lanes[lane].has(c));
      if (!hasOverlap) break;
      lane++;
    }

    // Reserve columns in this lane
    for (const c of occupiedCols) {
      lanes[lane].add(c);
    }

    placed.push({ load, colStart, colSpan, lane });
  }

  return placed;
}

function isDayOccupiedByLoad(dayStr: string, placedLoads: PlacedLoad[], dayStrings: string[]): boolean {
  const dayIdx = dayStrings.indexOf(dayStr);
  return placedLoads.some((p) => dayIdx >= p.colStart && dayIdx < p.colStart + p.colSpan);
}

const LOAD_LANE_HEIGHT = 52; // px per load lane — load number + route + customer

export function TimelineDriverRow({
  driver,
  dayStrings,
  suggestions,
  onAcceptSuggestion,
  onDismissSuggestion,
  onDeleteDriverUnavail,
  onDeleteVehicleUnavail,
  onOpenSlotClick,
  onLoadClick,
}: TimelineDriverRowProps) {
  // Collect all loads and compute layout
  const allLoads = useMemo(() => {
    const loads: HorizonLoadBlock[] = [];
    for (const dayData of Object.values(driver.days)) {
      loads.push(...dayData.loads);
    }
    return loads;
  }, [driver.days]);

  const placedLoads = useMemo(() => layoutLoads(allLoads, dayStrings), [allLoads, dayStrings]);

  const laneCount = placedLoads.length > 0 ? Math.max(...placedLoads.map((p) => p.lane)) + 1 : 0;

  const loadAreaHeight = laneCount * LOAD_LANE_HEIGHT;

  return (
    <div className="grid grid-cols-[220px_repeat(7,1fr)] gap-px border-b border-border hover:bg-muted/20 dark:hover:bg-muted/5 transition-colors">
      {/* Driver info cell */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
          {driver.initials}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{driver.name}</div>
          <div className="flex items-center gap-1 text-2xs text-muted-foreground">
            {driver.vehicleNumber ? (
              <>
                <Truck className="h-3 w-3" />
                {driver.vehicleNumber}
              </>
            ) : (
              <span className="text-yellow-600 dark:text-yellow-400">No truck</span>
            )}
          </div>
        </div>
      </div>

      {/* Day cells */}
      {dayStrings.map((dayStr) => {
        const day = driver.days[dayStr];
        const date = parseISO(dayStr);
        const isTodayCol = isToday(date);
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;

        if (!day)
          return (
            <div
              key={dayStr}
              className={cn('px-1 py-1 min-h-[40px]', isTodayCol && 'bg-primary/[0.03]', isWeekend && 'opacity-50')}
            />
          );

        const daySuggestions = suggestions.filter((s) => s.driverId === driver.driverId && s.date === dayStr);
        const hasLoad = isDayOccupiedByLoad(dayStr, placedLoads, dayStrings);
        const hasUnavail = !!day.driverUnavailability || !!day.vehicleUnavailability;
        const hasSuggestion = daySuggestions.length > 0;
        const isEmpty = !hasLoad && !hasUnavail && !hasSuggestion;
        const dayIdx = dayStrings.indexOf(dayStr);

        return (
          <div
            key={dayStr}
            className={cn(
              'relative px-1 py-1 min-h-[40px]',
              isTodayCol && 'bg-primary/[0.03]',
              isWeekend && 'opacity-60',
            )}
          >
            {/* Load lanes — absolutely positioned spans */}
            {placedLoads
              .filter((p) => dayIdx === p.colStart)
              .map((p) => (
                <div
                  key={p.load.loadNumber}
                  className="absolute z-10"
                  style={{
                    top: p.lane * LOAD_LANE_HEIGHT + 4,
                    left: 4,
                    width: `calc(${p.colSpan * 100}% - 8px)`,
                  }}
                >
                  <LoadBlock load={p.load} onClick={onLoadClick} />
                </div>
              ))}

            {/* Spacer for load lanes */}
            {loadAreaHeight > 0 && <div style={{ height: loadAreaHeight }} />}

            {/* Non-load content below the load lanes */}
            <div className="flex flex-col gap-1">
              {day.driverUnavailability && (
                <UnavailBlock unavail={day.driverUnavailability} variant="driver" onDelete={onDeleteDriverUnavail} />
              )}
              {day.vehicleUnavailability && (
                <UnavailBlock
                  unavail={day.vehicleUnavailability}
                  variant="vehicle"
                  vehicleNumber={driver.vehicleNumber}
                  onDelete={onDeleteVehicleUnavail}
                />
              )}
              {daySuggestions.map((s) => (
                <SuggestionBlock
                  key={s.suggestionId}
                  suggestion={s}
                  onAccept={onAcceptSuggestion}
                  onDismiss={onDismissSuggestion}
                />
              ))}
              {isEmpty && (
                <OpenSlot
                  driverId={driver.driverId}
                  dayStr={dayStr}
                  onClick={onOpenSlotClick ? () => onOpenSlotClick(driver.driverId, dayStr) : undefined}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
